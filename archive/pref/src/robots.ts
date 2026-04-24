/**
 * @peac/pref/robots - DEPRECATED robots.txt parser with AIPREF bridge.
 *
 * @peac/pref is deprecated as of v0.12.14. This module is a thin, deprecated
 * facade:
 *   - `parseRobots` defers to @peac/mappings-content-signals robots parser.
 *   - `robotsToAIPref` maps the content-signal result back into the legacy
 *     AIPrefSnapshot shape for backward compat.
 *   - `fetchRobots` is removed: parsing packages do not perform network I/O.
 *     Callers supply pre-fetched content.
 *   - `robotsToPeacStarter` is preserved as a one-way migration helper that
 *     produces a starter `peac-policy/0.1` document from robots.txt bytes.
 *
 * Removal target: next cleanup release.
 */

import { parseRobotsTxt as parseRobotsStructured } from '@peac/mappings-content-signals';
import type { AIPrefSnapshot, RobotsRule } from './types.js';
import type { PolicyDocument, PolicyRule } from '@peac/policy-kit';

/**
 * Low-level robots.txt record parser used for the @peac/pref legacy shape.
 * Retained for backward compat. For structured content-signal entries, call
 * `parseRobotsTxt` from `@peac/mappings-content-signals` directly.
 *
 * @deprecated Retained to preserve the @peac/pref API. Use
 * `@peac/mappings-content-signals.parseRobotsTxt` for RFC 9309-compliant
 * parsing that produces typed `ContentSignalEntry[]`.
 */
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
        rules.push({ userAgent: currentAgent, directives: currentDirectives });
      }
      currentAgent = value;
      currentDirectives = [];
    } else if (currentAgent) {
      currentDirectives.push({ field: fieldLower, value });
    }
  }

  if (currentAgent && currentDirectives.length > 0) {
    rules.push({ userAgent: currentAgent, directives: currentDirectives });
  }

  return rules;
}

/**
 * Map robots.txt bytes to the legacy AIPrefSnapshot shape via the canonical
 * content-signal resolver in `@peac/mappings-content-signals`. Preserved for
 * backward compat of the @peac/pref API.
 *
 * @deprecated Use `@peac/mappings-content-signals.parseRobotsTxt` +
 * `resolveSignals` directly. Removal target: next cleanup release.
 */
export function robotsToAIPref(rulesOrContent: RobotsRule[] | string): AIPrefSnapshot | null {
  const content =
    typeof rulesOrContent === 'string' ? rulesOrContent : rulesToRobotsText(rulesOrContent);
  const entries = parseRobotsStructured(content);
  const snapshot: AIPrefSnapshot = {};
  let hasPrefs = false;
  for (const entry of entries) {
    if (entry.decision === 'unspecified') continue;
    const allow = entry.decision === 'allow';
    switch (entry.purpose) {
      case 'ai-training':
      case 'ai-generative':
      case 'ai-inference':
        if (snapshot['train-ai'] === undefined) snapshot['train-ai'] = allow;
        hasPrefs = true;
        break;
      case 'ai-search':
      case 'tdm':
        if (snapshot.crawl === undefined) snapshot.crawl = allow;
        hasPrefs = true;
        break;
    }
  }
  return hasPrefs ? snapshot : null;
}

function rulesToRobotsText(rules: RobotsRule[]): string {
  const lines: string[] = [];
  for (const rule of rules) {
    lines.push(`User-agent: ${rule.userAgent}`);
    for (const directive of rule.directives) {
      lines.push(`${directive.field}: ${directive.value}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * @deprecated v0.12.14 facade does not perform network I/O. Parsing packages
 * take pre-fetched content only. Fetch robots.txt in the caller (subject to
 * the caller's SSRF / redirect / timeout policy) and pass the bytes to
 * `parseRobots`, `robotsToAIPref`, or the RFC-compliant
 * `@peac/mappings-content-signals.parseRobotsTxt`. Removal target: next
 * cleanup release.
 */
export function fetchRobots(_uri: string, _timeout?: number): Promise<string | null> {
  const err = new Error(
    '@peac/pref fetchRobots() was removed in v0.12.14: parsing packages do not ' +
      'perform network I/O. Fetch robots.txt in the caller and pass the bytes to ' +
      'parseRobots() / robotsToAIPref() / @peac/mappings-content-signals.parseRobotsTxt().'
  );
  (err as Error & { code?: string }).code = 'PEAC_DEPRECATED_PREF_NETWORK';
  return Promise.reject(err);
}

/**
 * Result of converting robots.txt to a PEAC policy starter.
 */
export interface RobotsToPeacResult {
  /** Generated starter policy document. */
  policy: PolicyDocument;
  /** Advisory notes about the conversion. */
  notes: string[];
  /** User agents that were processed. */
  processedAgents: string[];
  /** Whether any AI-related restrictions were found. */
  hasAiRestrictions: boolean;
}

/**
 * Known AI crawler user agents.
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
 * Convert robots.txt content to a `peac-policy/0.1` starter document.
 *
 * ADVISORY ONLY: a migration helper, not a compliance tool. Generated output
 * is a starting point that operators MUST review and customize.
 *
 * Limitations: robots.txt is less expressive than PEAC policies; path-specific
 * rules are simplified to domain-level; crawl-delay and sitemap directives are
 * noted but not mapped; one-way (not round-trippable).
 */
export function robotsToPeacStarter(robotsContent: string): RobotsToPeacResult {
  const rules = parseRobots(robotsContent);
  const notes: string[] = [];
  const processedAgents: string[] = [];
  const policyRules: PolicyRule[] = [];
  let hasAiRestrictions = false;

  notes.push(
    'ADVISORY: This policy was generated from robots.txt and is for migration purposes only.'
  );
  notes.push('Review and customize this policy before using in production.');

  for (const rule of rules) {
    const ua = rule.userAgent.toLowerCase();
    processedAgents.push(rule.userAgent);

    const isAiAgent = AI_CRAWLER_AGENTS.some((agent) => ua.includes(agent));
    const isWildcard = ua === '*';

    let hasDisallowAll = false;
    let hasAllowAll = false;
    let hasPartialRules = false;

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
          notes.push(
            `Note: Crawl-delay for ${rule.userAgent} (${directive.value}s) not mapped - consider rate limits.`
          );
          break;
        case 'sitemap':
          notes.push(`Note: Sitemap directive ignored: ${directive.value}`);
          break;
      }
    }

    if (isAiAgent) {
      if (hasDisallowAll) {
        hasAiRestrictions = true;
        policyRules.push({
          name: `deny-${ua.replace(/[^a-z0-9]/g, '-')}`,
          subject: { labels: [ua] },
          decision: 'deny',
          reason: `Converted from robots.txt: Disallow / for ${rule.userAgent}`,
        });
      } else if (hasAllowAll) {
        policyRules.push({
          name: `allow-${ua.replace(/[^a-z0-9]/g, '-')}`,
          subject: { labels: [ua] },
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

    if (isWildcard && hasDisallowAll) {
      hasAiRestrictions = true;
      notes.push('Note: Wildcard Disallow: / detected. Consider if this applies to all AI agents.');
      policyRules.push({
        name: 'deny-all-crawlers-wildcard',
        subject: { type: 'agent' },
        purpose: 'index',
        decision: 'deny',
        reason: 'Converted from robots.txt: Wildcard Disallow: /',
      });
    }
  }

  if (policyRules.length === 0) {
    notes.push(
      'No AI-specific restrictions found in robots.txt. Generated minimal starter policy.'
    );
  }

  const policy: PolicyDocument = {
    version: 'peac-policy/0.1',
    name: 'Policy generated from robots.txt',
    defaults: {
      decision: 'review',
      reason: 'Default: review access (customize as needed)',
    },
    rules: policyRules,
  };

  return { policy, notes, processedAgents, hasAiRestrictions };
}
