/**
 * @peac/pref/robots - Robots.txt parser with AIPREF bridge
 * Extracts AI-relevant directives from robots.txt
 *
 * IMPORTANT: robots.txt is NOT enforceable. The robotsToPeacStarter()
 * function is a MIGRATION HELPER, not a compliance tool. It generates
 * a starter PEAC policy that users should review and customize.
 */

import type { AIPrefSnapshot, RobotsRule } from './types.js';
import type { PolicyDocument, PolicyRule } from '@peac/policy-kit';

const VERSION = '0.9.15';
const UA = `PEAC/${VERSION} (+https://peacprotocol.org)`;

// SSRF protection: Check if hostname/IP is in private network range
function isPrivateNetwork(hostname: string): boolean {
  // Block localhost variants
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) {
    return true;
  }

  // Block private IPv4 ranges (RFC 1918)
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);

    // 10.0.0.0/8
    if (a === 10) return true;

    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;

    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
  }

  // Block private IPv6 ranges
  if (hostname.includes(':')) {
    // ::1 already covered above
    // fc00::/7 (unique local)
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;

    // fe80::/10 (link-local)
    if (
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb')
    )
      return true;
  }

  return false;
}

export function parseRobots(content: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  let currentAgent = '';
  let currentDirectives: Array<{ field: string; value: string }> = [];

  for (const line of lines) {
    const [field, ...valueParts] = line.split(':');
    if (!field || valueParts.length === 0) continue;

    const fieldLower = field.toLowerCase().trim();
    const value = valueParts.join(':').trim();

    if (fieldLower === 'user-agent') {
      if (currentAgent && currentDirectives.length > 0) {
        rules.push({
          userAgent: currentAgent,
          directives: currentDirectives,
        });
      }
      currentAgent = value;
      currentDirectives = [];
    } else if (currentAgent) {
      currentDirectives.push({ field: fieldLower, value });
    }
  }

  if (currentAgent && currentDirectives.length > 0) {
    rules.push({
      userAgent: currentAgent,
      directives: currentDirectives,
    });
  }

  return rules;
}

export function robotsToAIPref(rules: RobotsRule[]): AIPrefSnapshot | null {
  const snapshot: AIPrefSnapshot = {};
  let hasPrefs = false;

  // Look for AI-related user agents and directives
  const aiAgents = [
    'gptbot',
    'chatgpt-user',
    'claude-web',
    'anthropic-ai',
    'openai',
    'google-extended',
  ];

  for (const rule of rules) {
    const ua = rule.userAgent.toLowerCase();
    const isAiAgent = aiAgents.some((agent) => ua.includes(agent)) || ua === '*';

    if (isAiAgent) {
      for (const directive of rule.directives) {
        // Map robots directives to AIPREF fields
        switch (directive.field) {
          case 'disallow':
            if (directive.value === '/' || directive.value === '*') {
              snapshot.crawl = false;
              snapshot['train-ai'] = false;
              hasPrefs = true;
            }
            break;
          case 'allow':
            if (directive.value === '/' || directive.value === '*') {
              snapshot.crawl = true;
              hasPrefs = true;
            }
            break;
          case 'noai':
            snapshot['train-ai'] = false;
            hasPrefs = true;
            break;
          case 'nofollow':
            snapshot.crawl = false;
            hasPrefs = true;
            break;
        }
      }
    }
  }

  return hasPrefs ? snapshot : null;
}

export async function fetchRobots(uri: string, timeout = 5000): Promise<string | null> {
  try {
    const url = new URL(uri);

    // SSRF protection: Only allow HTTPS/HTTP schemes
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Invalid protocol: only https:// and http:// are allowed');
    }

    // SSRF protection: Block private IP ranges and localhost
    const hostname = url.hostname.toLowerCase();
    if (isPrivateNetwork(hostname)) {
      throw new Error('Access to private networks is not allowed');
    }

    const robotsUrl = new URL('/robots.txt', url.origin);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(robotsUrl.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Result of converting robots.txt to PEAC policy starter
 */
export interface RobotsToPeacResult {
  /** Generated starter policy document */
  policy: PolicyDocument;
  /** Advisory notes about the conversion */
  notes: string[];
  /** User agents that were processed */
  processedAgents: string[];
  /** Whether any AI-related restrictions were found */
  hasAiRestrictions: boolean;
}

/**
 * Known AI crawler user agents
 */
const AI_CRAWLER_AGENTS = [
  'gptbot',
  'chatgpt-user',
  'claude-web',
  'anthropic-ai',
  'openai',
  'google-extended',
  'ccbot',
  'cohere-ai',
  'perplexitybot',
  'bytespider',
  'amazonbot',
  'applebot-extended',
  'facebookbot',
  'meta-externalagent',
] as const;

/**
 * Convert robots.txt content to a PEAC policy starter document.
 *
 * ADVISORY ONLY: This is a migration helper, not a compliance tool.
 * The generated policy is a starting point that users MUST review
 * and customize for their specific needs.
 *
 * Limitations:
 * - robots.txt is less expressive than PEAC policies
 * - Path-specific rules are simplified to domain-level
 * - Crawl-delay and sitemap directives are noted but not mapped
 * - This is a ONE-WAY import, not round-trippable
 *
 * @param robotsContent - Raw robots.txt content
 * @returns Starter policy document with advisory notes
 *
 * @example
 * ```typescript
 * const result = robotsToPeacStarter(`
 * User-agent: GPTBot
 * Disallow: /
 *
 * User-agent: *
 * Allow: /
 * `);
 *
 * console.log(result.policy);
 * // PolicyDocument with rules denying GPTBot access
 *
 * console.log(result.notes);
 * // Advisory notes about the conversion
 * ```
 */
export function robotsToPeacStarter(robotsContent: string): RobotsToPeacResult {
  const rules = parseRobots(robotsContent);
  const notes: string[] = [];
  const processedAgents: string[] = [];
  const policyRules: PolicyRule[] = [];
  let hasAiRestrictions = false;

  // Advisory header note
  notes.push(
    'ADVISORY: This policy was generated from robots.txt and is for migration purposes only.'
  );
  notes.push('Review and customize this policy before using in production.');

  // Process each rule
  for (const rule of rules) {
    const ua = rule.userAgent.toLowerCase();
    processedAgents.push(rule.userAgent);

    // Check if this is an AI-related agent
    const isAiAgent = AI_CRAWLER_AGENTS.some((agent) => ua.includes(agent));
    const isWildcard = ua === '*';

    // Analyze directives for this agent
    let hasDisallowAll = false;
    let hasAllowAll = false;
    let hasPartialRules = false;
    let hasCrawlDelay = false;

    for (const directive of rule.directives) {
      switch (directive.field) {
        case 'disallow':
          if (directive.value === '/' || directive.value === '') {
            hasDisallowAll = directive.value === '/';
          } else {
            hasPartialRules = true;
          }
          break;
        case 'allow':
          if (directive.value === '/' || directive.value === '*') {
            hasAllowAll = true;
          } else {
            hasPartialRules = true;
          }
          break;
        case 'crawl-delay':
          hasCrawlDelay = true;
          notes.push(
            `Note: Crawl-delay for ${rule.userAgent} (${directive.value}s) not mapped - consider rate limits.`
          );
          break;
        case 'sitemap':
          notes.push(`Note: Sitemap directive ignored: ${directive.value}`);
          break;
      }
    }

    // Generate policy rules for AI agents
    if (isAiAgent) {
      if (hasDisallowAll) {
        hasAiRestrictions = true;
        policyRules.push({
          name: `deny-${ua.replace(/[^a-z0-9]/g, '-')}`,
          subject: {
            labels: [ua],
          },
          decision: 'deny',
          reason: `Converted from robots.txt: Disallow / for ${rule.userAgent}`,
        });
      } else if (hasAllowAll) {
        policyRules.push({
          name: `allow-${ua.replace(/[^a-z0-9]/g, '-')}`,
          subject: {
            labels: [ua],
          },
          decision: 'allow',
          reason: `Converted from robots.txt: Allow for ${rule.userAgent}`,
        });
      }

      if (hasPartialRules) {
        notes.push(
          `Warning: Path-specific rules for ${rule.userAgent} simplified to domain-level.`
        );
      }
    }

    // Handle wildcard rules that affect AI crawlers
    if (isWildcard && hasDisallowAll) {
      hasAiRestrictions = true;
      notes.push('Note: Wildcard Disallow: / detected. Consider if this applies to all AI agents.');

      // Add a catch-all deny rule for AI crawlers (lower priority)
      policyRules.push({
        name: 'deny-all-crawlers-wildcard',
        subject: {
          type: 'agent',
        },
        purpose: 'index',
        decision: 'deny',
        reason: 'Converted from robots.txt: Wildcard Disallow: /',
      });
    }
  }

  // If no AI-specific rules found, add a note
  if (policyRules.length === 0) {
    notes.push(
      'No AI-specific restrictions found in robots.txt. Generated minimal starter policy.'
    );
  }

  // Build the policy document
  const policy: PolicyDocument = {
    version: 'peac-policy/0.1',
    name: 'Policy generated from robots.txt',
    defaults: {
      decision: 'review',
      reason: 'Default: review access (customize as needed)',
    },
    rules: policyRules,
  };

  return {
    policy,
    notes,
    processedAgents,
    hasAiRestrictions,
  };
}
