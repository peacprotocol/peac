/**
 * PEAC Policy Kit Compiler
 *
 * Compiles policy documents to deployment artifacts:
 * - peac.txt (PEAC discovery file - canonical schema)
 * - robots.txt snippet for AI crawlers
 * - AIPREF header templates (compatibility output)
 * - Human-readable markdown summary
 *
 * All outputs are deterministic (stable ordering where semantically safe).
 * Rule order is preserved where it affects semantics (first-match-wins).
 *
 * @packageDocumentation
 */

import { PolicyDocument, ControlPurpose, POLICY_VERSION } from './types';

/**
 * Default PEAC protocol version for generated peac.txt
 *
 * Uses major.minor format (e.g., "0.9") by default. Pass a full version
 * (e.g., "0.9.17") via peacVersion option if needed.
 *
 * This matches the wire format version from @peac/kernel.
 */
export const PEAC_PROTOCOL_VERSION = '0.9' as const;

/**
 * Options for compilation
 */
export interface CompileOptions {
  /** Base URL for the site (used in peac.txt) */
  siteUrl?: string;
  /** Contact email for policy questions */
  contact?: string;
  /** Include comments in output */
  includeComments?: boolean;
  /**
   * PEAC protocol version for peac.txt (default: 0.9)
   * Use major.minor (0.9) or full version (0.9.17) as needed.
   */
  peacVersion?: string;
  /** Attribution requirement: required, optional, or none */
  attribution?: 'required' | 'optional' | 'none';
  /**
   * Receipts requirement: required, optional, or omit (don't include field)
   * Default: 'required' for conditional usage, 'optional' for open usage
   */
  receipts?: 'required' | 'optional' | 'omit';
  /** Rate limit string (e.g., "100/hour", "unlimited") */
  rateLimit?: string;
  /** Negotiate endpoint URL */
  negotiateUrl?: string;
}

/**
 * AIPREF header template
 */
export interface AiprefTemplate {
  /** Header name */
  header: string;
  /** Header value */
  value: string;
  /** Description of when to use */
  description: string;
}

/**
 * Compile policy to peac.txt format (canonical schema)
 *
 * Generates a PEAC discovery file that can be served at:
 * - /.well-known/peac.txt (primary)
 * - /peac.txt (fallback)
 *
 * Output uses canonical PEAC schema with `version` and `usage` fields.
 * Rule order is preserved in comments (first-match-wins semantics).
 *
 * @param policy - Policy document
 * @param options - Compilation options
 * @returns peac.txt content (YAML format)
 */
export function compilePeacTxt(policy: PolicyDocument, options: CompileOptions = {}): string {
  const lines: string[] = [];
  const { includeComments = true, peacVersion = PEAC_PROTOCOL_VERSION } = options;

  if (includeComments) {
    lines.push('# PEAC Policy Discovery File');
    lines.push(`# Generated from: ${policy.name || 'peac-policy.yaml'}`);
    lines.push('#');
    lines.push('# Serve at: /.well-known/peac.txt');
    lines.push('# See: https://peacprotocol.org');
    lines.push('');
  }

  // PEAC protocol version (canonical field)
  lines.push(`version: ${peacVersion}`);

  // Usage: open (allow default) or conditional (deny/review default)
  const usage = policy.defaults.decision === 'allow' ? 'open' : 'conditional';
  lines.push(`usage: ${usage}`);
  lines.push('');

  // List purposes covered by rules (sorted for determinism - safe because informational)
  const purposes = extractPurposes(policy);
  if (purposes.length > 0) {
    lines.push(`purposes: [${purposes.join(', ')}]`);
  }

  // Attribution if specified
  if (options.attribution && options.attribution !== 'none') {
    lines.push(`attribution: ${options.attribution}`);
  }

  // Receipts: configurable, with sensible defaults based on usage
  // - conditional: defaults to 'required' (explicit receipt needed)
  // - open: defaults to 'optional' (receipt accepted but not required)
  const receiptsDefault = usage === 'conditional' ? 'required' : 'optional';
  const receiptsValue = options.receipts ?? receiptsDefault;
  if (receiptsValue !== 'omit') {
    lines.push(`receipts: ${receiptsValue}`);
  }

  // Rate limit (applies to both open and conditional)
  if (options.rateLimit) {
    lines.push(`rate_limit: ${options.rateLimit}`);
  }

  // Negotiate endpoint (typically for conditional access)
  if (options.negotiateUrl) {
    lines.push(`negotiate: ${options.negotiateUrl}`);
  }

  // Contact if provided
  if (options.contact) {
    lines.push(`contact: ${options.contact}`);
  }

  // Show rule summary in comments (preserve author order - semantically significant)
  if (policy.rules.length > 0 && includeComments) {
    lines.push('');
    lines.push('# Policy rules (first-match-wins, author order preserved):');
    lines.push(`# Source: ${policy.name || 'peac-policy.yaml'} (${policy.rules.length} rules)`);
    for (const rule of policy.rules) {
      lines.push(`#   ${rule.name}: ${rule.decision}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Compile policy to robots.txt snippet for AI crawlers
 *
 * Generates User-agent blocks for known AI crawlers based on policy.
 * Conservative: if default is deny or review, disallows crawling.
 *
 * @param policy - Policy document
 * @param options - Compilation options
 * @returns robots.txt snippet content
 */
export function compileRobotsSnippet(policy: PolicyDocument, options: CompileOptions = {}): string {
  const lines: string[] = [];
  const { includeComments = true } = options;

  // Known AI crawler user agents (sorted for determinism)
  const aiCrawlers = [
    'Anthropic-AI',
    'CCBot',
    'ChatGPT-User',
    'Claude-Web',
    'Cohere-AI',
    'GPTBot',
    'Google-Extended',
    'Meta-ExternalAgent',
    'Meta-ExternalFetcher',
    'PerplexityBot',
    'anthropic-ai',
    'cohere-ai',
  ];

  if (includeComments) {
    lines.push('# AI Crawler Directives');
    lines.push(`# Generated from PEAC policy: ${policy.name || 'peac-policy.yaml'}`);
    lines.push('#');
    lines.push('# SNIPPET - Review before adding to your robots.txt');
    lines.push(`# Default policy: ${policy.defaults.decision}`);
    lines.push('');
  }

  // Conservative approach: only allow if default is explicitly 'allow'
  // If default is 'deny' or 'review', disallow and require PEAC receipt
  const isDefaultAllow = policy.defaults.decision === 'allow';

  for (const crawler of aiCrawlers) {
    lines.push(`User-agent: ${crawler}`);
    if (isDefaultAllow) {
      lines.push('Allow: /');
    } else {
      lines.push('Disallow: /');
      if (includeComments) {
        lines.push('# Requires PEAC receipt for access');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Compile policy to AIPREF header templates
 *
 * Generates header values for HTTP responses.
 * These are COMPATIBILITY templates, not normative PEAC headers.
 * The authoritative policy is always peac.txt.
 *
 * @param policy - Policy document
 * @param options - Compilation options
 * @returns Array of header templates
 */
export function compileAiprefTemplates(
  policy: PolicyDocument,
  options: CompileOptions = {}
): AiprefTemplate[] {
  const templates: AiprefTemplate[] = [];
  const { peacVersion = PEAC_PROTOCOL_VERSION } = options;
  const usage = policy.defaults.decision === 'allow' ? 'open' : 'conditional';

  // PEAC-Policy header (debug/compatibility - see peac.txt for authoritative policy)
  templates.push({
    header: 'PEAC-Policy',
    value: `version=${peacVersion}; usage=${usage}; rules=${policy.rules.length}`,
    description: 'Debug/compatibility header - see peac.txt for authoritative policy',
  });

  // X-Robots-Tag for AI (compatibility, widely supported)
  if (policy.defaults.decision === 'deny') {
    templates.push({
      header: 'X-Robots-Tag',
      value: 'noai, noimageai',
      description: 'Compatibility header: signal no AI training (default deny policy)',
    });
  }

  // Note about AIPREF-style headers
  templates.push({
    header: '# Compatibility Note',
    value: 'See /.well-known/peac.txt for authoritative policy',
    description:
      'These headers are for compatibility only. AIPREF-style X-AI-* headers are not generated to avoid contradictions with conditional rules.',
  });

  return templates;
}

/**
 * Render policy as human-readable markdown
 *
 * Generates an ai-policy.md file for documentation.
 *
 * @param policy - Policy document
 * @param options - Compilation options
 * @returns Markdown content
 */
export function renderPolicyMarkdown(policy: PolicyDocument, options: CompileOptions = {}): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${policy.name || 'AI Access Policy'}`);
  lines.push('');
  lines.push(`> Generated from PEAC policy (${policy.version})`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Default Decision:** ${policy.defaults.decision}`);
  if (policy.defaults.reason) {
    lines.push(`- **Default Reason:** ${policy.defaults.reason}`);
  }
  lines.push(`- **Total Rules:** ${policy.rules.length}`);
  lines.push('');

  // Contact
  if (options.contact) {
    lines.push(`For questions about this policy, contact: ${options.contact}`);
    lines.push('');
  }

  // How it works
  lines.push('## How This Policy Works');
  lines.push('');
  lines.push(
    'This policy uses **first-match-wins** semantics (like firewall rules). When an AI agent requests access:'
  );
  lines.push('');
  lines.push('1. Rules are evaluated in order');
  lines.push('2. The first matching rule determines the decision');
  lines.push('3. If no rule matches, the default decision applies');
  lines.push('');

  // Rules (preserve author order - first-match-wins semantics are order-dependent)
  if (policy.rules.length > 0) {
    lines.push('## Rules');
    lines.push('');
    lines.push('> Rules are evaluated in order. The first matching rule wins.');
    lines.push('');
    for (const rule of policy.rules) {
      lines.push(`### ${rule.name}`);
      lines.push('');
      lines.push(`- **Decision:** ${rule.decision}`);
      if (rule.reason) {
        lines.push(`- **Reason:** ${rule.reason}`);
      }
      if (rule.subject) {
        const subjectParts: string[] = [];
        if (rule.subject.type) {
          const types = Array.isArray(rule.subject.type)
            ? rule.subject.type.join(', ')
            : rule.subject.type;
          subjectParts.push(`type: ${types}`);
        }
        if (rule.subject.labels) {
          subjectParts.push(`labels: ${rule.subject.labels.join(', ')}`);
        }
        if (rule.subject.id) {
          subjectParts.push(`id: ${rule.subject.id}`);
        }
        if (subjectParts.length > 0) {
          lines.push(`- **Subject:** ${subjectParts.join('; ')}`);
        }
      }
      if (rule.purpose) {
        const purposes = Array.isArray(rule.purpose) ? rule.purpose.join(', ') : rule.purpose;
        lines.push(`- **Purpose:** ${purposes}`);
      }
      if (rule.licensing_mode) {
        const modes = Array.isArray(rule.licensing_mode)
          ? rule.licensing_mode.join(', ')
          : rule.licensing_mode;
        lines.push(`- **Licensing Mode:** ${modes}`);
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(
    '*This policy is enforced via the PEAC Protocol. See [peacprotocol.org](https://peacprotocol.org) for more information.*'
  );
  lines.push('');

  return lines.join('\n');
}

// --- Helper functions ---

/**
 * Extract all unique purposes from policy rules (sorted for determinism)
 */
function extractPurposes(policy: PolicyDocument): ControlPurpose[] {
  const purposes = new Set<ControlPurpose>();

  for (const rule of policy.rules) {
    if (rule.purpose) {
      if (Array.isArray(rule.purpose)) {
        for (const p of rule.purpose) {
          purposes.add(p);
        }
      } else {
        purposes.add(rule.purpose);
      }
    }
  }

  // Sort for deterministic output
  return Array.from(purposes).sort();
}
