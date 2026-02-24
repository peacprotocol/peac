/**
 * robots.txt Parser (RFC 9309)
 *
 * Parses robots.txt content and extracts AI-relevant signals.
 * Receives pre-fetched text content (no network I/O, DD-55).
 */

import type { ContentSignalEntry, ContentPurpose, SignalDecision } from './types.js';
import { AI_USER_AGENTS, MAX_ROBOTS_TXT_SIZE } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RobotGroup {
  userAgents: string[];
  disallow: string[];
  allow: string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse robots.txt content into structured groups.
 *
 * Follows RFC 9309 (Robots Exclusion Protocol, Sep 2022):
 * - Groups are defined by User-agent lines
 * - Disallow/Allow directives apply to the preceding user-agent group
 * - Case-insensitive directive matching
 * - Lines starting with # are comments
 */
function parseRobotGroups(content: string): RobotGroup[] {
  const groups: RobotGroup[] = [];
  let currentGroup: RobotGroup | null = null;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) {
      // Empty line between groups ends the current group
      if (line === '' && currentGroup && currentGroup.userAgents.length > 0) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      continue;
    }

    // Parse directive: "Field: Value"
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line
      .slice(colonIdx + 1)
      .split('#')[0]
      .trim(); // Strip inline comments

    if (field === 'user-agent') {
      if (!currentGroup) {
        currentGroup = { userAgents: [], disallow: [], allow: [] };
      }
      currentGroup.userAgents.push(value.toLowerCase());
    } else if (field === 'disallow') {
      if (!currentGroup) {
        currentGroup = { userAgents: ['*'], disallow: [], allow: [] };
      }
      currentGroup.disallow.push(value);
    } else if (field === 'allow') {
      if (!currentGroup) {
        currentGroup = { userAgents: ['*'], disallow: [], allow: [] };
      }
      currentGroup.allow.push(value);
    }
    // Sitemap and other directives are ignored for signal purposes
  }

  // Push final group if any
  if (currentGroup && currentGroup.userAgents.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Determine signal decision for a group.
 *
 * Per RFC 9309:
 * - Disallow: / means deny all
 * - Empty Disallow: means allow all
 * - More specific paths are not evaluated (we only check root-level signals)
 */
function groupDecision(group: RobotGroup): SignalDecision {
  // Filter out empty Disallow values (empty string = allow per RFC 9309)
  const effectiveDisallow = group.disallow.filter((d) => d.length > 0);

  // No effective Disallow lines means allow
  if (effectiveDisallow.length === 0) {
    return 'allow';
  }

  // Check for blanket deny (Disallow: /)
  if (effectiveDisallow.some((d) => d === '/')) {
    // Check if there's a more specific Allow (e.g., Allow: /public/)
    // For signal purposes, Disallow: / is a deny unless Allow: / overrides
    if (group.allow.some((a) => a === '/')) {
      return 'allow';
    }
    return 'deny';
  }

  // Disallow present but not root-level: partial deny, treated as unspecified
  // for signal purposes (we don't resolve path-specific rules)
  return 'unspecified';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse robots.txt content and extract AI-relevant signals.
 *
 * @param content - Raw text content of robots.txt (pre-fetched)
 * @returns Array of ContentSignalEntry for matched AI user-agents
 */
export function parseRobotsTxt(content: string): ContentSignalEntry[] {
  if (content.length > MAX_ROBOTS_TXT_SIZE) {
    return [];
  }

  const groups = parseRobotGroups(content);
  const entries: ContentSignalEntry[] = [];
  const seenPurposes = new Set<ContentPurpose>();

  // First pass: check specific AI user-agents
  for (const group of groups) {
    for (const ua of group.userAgents) {
      const purposes = AI_USER_AGENTS[ua];
      if (!purposes) continue;

      const decision = groupDecision(group);
      for (const purpose of purposes) {
        if (seenPurposes.has(purpose)) continue;
        seenPurposes.add(purpose);
        entries.push({
          purpose,
          decision,
          source: 'robots-txt',
          raw_value: `User-agent: ${ua}`,
        });
      }
    }
  }

  // Second pass: check wildcard * for remaining purposes
  const wildcardGroup = groups.find((g) => g.userAgents.includes('*'));
  if (wildcardGroup) {
    const decision = groupDecision(wildcardGroup);
    const allPurposes: ContentPurpose[] = [
      'ai-training',
      'ai-inference',
      'ai-search',
      'ai-generative',
    ];
    for (const purpose of allPurposes) {
      if (seenPurposes.has(purpose)) continue;
      seenPurposes.add(purpose);
      entries.push({
        purpose,
        decision,
        source: 'robots-txt',
        raw_value: 'User-agent: *',
      });
    }
  }

  return entries;
}
