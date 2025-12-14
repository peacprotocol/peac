/**
 * PEAC Policy Kit Compiler
 *
 * Compiles policy documents to deployment artifacts:
 * - peac.txt (PEAC discovery file)
 * - robots.txt snippet for AI crawlers
 * - AIPREF header templates (labeled as compatibility output)
 * - Human-readable markdown summary
 *
 * All outputs are deterministic (stable ordering).
 * No contradictory allow/deny lists - shows default + conditional rules.
 *
 * @packageDocumentation
 */

import { PolicyDocument, ControlPurpose, ControlDecision, POLICY_VERSION } from './types';

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
 * Compile policy to peac.txt format
 *
 * Generates a PEAC discovery file that can be served at:
 * - /.well-known/peac.txt
 * - /peac.txt
 *
 * Output format shows default posture + conditional rules.
 * Does NOT collapse conditional rules into contradictory allow/deny lists.
 *
 * @param policy - Policy document
 * @param options - Compilation options
 * @returns peac.txt content
 */
export function compilePeacTxt(policy: PolicyDocument, options: CompileOptions = {}): string {
  const lines: string[] = [];
  const { includeComments = true } = options;

  if (includeComments) {
    lines.push('# PEAC Policy Discovery File');
    lines.push(`# Generated from: ${policy.name || 'peac-policy.yaml'}`);
    lines.push('#');
    lines.push('# This file declares AI access policy for this site.');
    lines.push('# Rules are conditional - see peac-policy.yaml for full details.');
    lines.push('# See: https://peacprotocol.org/spec/discovery');
    lines.push('');
  }

  // Policy version
  lines.push(`policy-version: ${POLICY_VERSION}`);

  // Site URL if provided
  if (options.siteUrl) {
    lines.push(`site: ${options.siteUrl}`);
  }

  // Contact if provided
  if (options.contact) {
    lines.push(`contact: ${options.contact}`);
  }

  // Default decision (the unconditional fallback)
  lines.push(`default: ${policy.defaults.decision}`);

  // Rule count - indicates conditional rules exist
  lines.push(`rules: ${policy.rules.length}`);

  // List purposes covered by rules (informational, not authoritative)
  const purposes = extractPurposes(policy);
  if (purposes.length > 0) {
    lines.push(`purposes: ${purposes.join(', ')}`);
  }

  // Show rule summary (name + decision only, conditions require full policy file)
  if (policy.rules.length > 0 && includeComments) {
    lines.push('');
    lines.push('# Rule summary (conditional - see source policy for details):');
    // Sort rules by name for determinism
    const sortedRules = [...policy.rules].sort((a, b) => a.name.localeCompare(b.name));
    for (const rule of sortedRules) {
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
 * LABELED AS COMPATIBILITY OUTPUT - these are not normative PEAC headers.
 *
 * @param policy - Policy document
 * @param _options - Compilation options
 * @returns Array of header templates
 */
export function compileAiprefTemplates(
  policy: PolicyDocument,
  _options: CompileOptions = {}
): AiprefTemplate[] {
  const templates: AiprefTemplate[] = [];

  // PEAC-Policy header (normative)
  templates.push({
    header: 'PEAC-Policy',
    value: `version=${POLICY_VERSION}; default=${policy.defaults.decision}; rules=${policy.rules.length}`,
    description: 'PEAC policy summary - indicates policy exists, see peac.txt for details',
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
    header: '# AIPREF Compatibility Note',
    value: 'See peac.txt for authoritative policy',
    description:
      'AIPREF-style X-AI-* headers are not generated to avoid contradictions with conditional rules',
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

  // Rules (sorted by name for determinism)
  if (policy.rules.length > 0) {
    lines.push('## Rules');
    lines.push('');
    const sortedRules = [...policy.rules].sort((a, b) => a.name.localeCompare(b.name));
    for (const rule of sortedRules) {
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
