/**
 * RSL (Robots Specification Layer) mapping for PEAC
 *
 * Maps RSL usage tokens to PEAC ControlPurpose values.
 * Provides a standards-aligned way to express content licensing
 * intentions in PEAC receipts.
 *
 * @packageDocumentation
 */

import type { ControlPurpose } from '@peac/schema';
import type { RslUsageToken, RslMappingResult, RslRule } from './types';

export type { RslUsageToken, RslMappingResult, RslRule } from './types';

/**
 * Mapping from RSL usage tokens to PEAC ControlPurpose values
 *
 * Rules:
 * - ai-train  -> ['train']
 * - ai-input  -> ['ai_input']
 * - ai-search -> ['ai_search']
 * - search    -> ['search']
 * - ai-all    -> ['train', 'ai_input', 'ai_search']
 */
const RSL_TO_CAL_MAP: Record<RslUsageToken, ControlPurpose[]> = {
  'ai-train': ['train'],
  'ai-input': ['ai_input'],
  'ai-search': ['ai_search'],
  search: ['search'],
  'ai-all': ['train', 'ai_input', 'ai_search'],
};

/**
 * Known RSL usage tokens
 */
const KNOWN_RSL_TOKENS = new Set<string>(['ai-train', 'ai-input', 'ai-search', 'search', 'ai-all']);

/**
 * Set of unknown tokens we've already warned about (dedupe in-process)
 */
const warnedTokens = new Set<string>();

/**
 * Warn about unknown RSL token (deduped to avoid log spam)
 */
function warnUnknownToken(token: string): void {
  if (!warnedTokens.has(token)) {
    warnedTokens.add(token);
    console.warn(`[peac:rsl] Unknown RSL usage token: "${token}"`);
  }
}

/**
 * Check if a string is a valid RSL usage token
 *
 * @param token - String to check
 * @returns True if token is a known RSL usage token
 */
export function isValidRslToken(token: string): token is RslUsageToken {
  return KNOWN_RSL_TOKENS.has(token);
}

/**
 * Map RSL usage tokens to PEAC ControlPurpose values
 *
 * Converts one or more RSL usage tokens to their corresponding
 * PEAC ControlPurpose values. Unknown tokens are logged as warnings
 * but do not cause errors (lenient handling).
 *
 * @param tokens - Array of RSL usage tokens (or strings)
 * @returns Mapping result with purposes and any unknown tokens
 *
 * @example
 * ```ts
 * const result = rslUsageTokensToControlPurposes(['ai-train', 'ai-input']);
 * // result.purposes = ['train', 'ai_input']
 * // result.unknownTokens = []
 * ```
 *
 * @example
 * ```ts
 * // ai-all expands to multiple purposes
 * const result = rslUsageTokensToControlPurposes(['ai-all']);
 * // result.purposes = ['train', 'ai_input', 'ai_search']
 * ```
 *
 * @example
 * ```ts
 * // Unknown tokens are collected but don't throw
 * const result = rslUsageTokensToControlPurposes(['ai-train', 'unknown-token']);
 * // result.purposes = ['train']
 * // result.unknownTokens = ['unknown-token']
 * // (warning logged to console)
 * ```
 */
export function rslUsageTokensToControlPurposes(
  tokens: (RslUsageToken | string)[]
): RslMappingResult {
  const purposes = new Set<ControlPurpose>();
  const unknownTokens: string[] = [];

  for (const token of tokens) {
    if (isValidRslToken(token)) {
      const mapped = RSL_TO_CAL_MAP[token];
      for (const purpose of mapped) {
        purposes.add(purpose);
      }
    } else {
      unknownTokens.push(token);
      // Lenient handling: log warning but don't throw (deduped)
      warnUnknownToken(token);
    }
  }

  return {
    purposes: Array.from(purposes),
    unknownTokens,
  };
}

/**
 * Map a single RSL usage token to PEAC ControlPurpose values
 *
 * Convenience function for mapping a single token.
 *
 * @param token - RSL usage token
 * @returns Array of ControlPurpose values, or empty array if unknown
 *
 * @example
 * ```ts
 * const purposes = rslTokenToControlPurposes('ai-train');
 * // purposes = ['train']
 * ```
 */
export function rslTokenToControlPurposes(token: RslUsageToken | string): ControlPurpose[] {
  if (isValidRslToken(token)) {
    return [...RSL_TO_CAL_MAP[token]];
  }
  warnUnknownToken(token);
  return [];
}

/**
 * Map PEAC ControlPurpose back to RSL usage token
 *
 * Reverse mapping for generating RSL-compatible output.
 * Note: This is a best-effort mapping; some purposes may not
 * have a direct RSL equivalent.
 *
 * @param purpose - PEAC ControlPurpose value
 * @returns RSL usage token or null if no direct mapping
 *
 * @example
 * ```ts
 * const token = controlPurposeToRslToken('train');
 * // token = 'ai-train'
 * ```
 */
export function controlPurposeToRslToken(purpose: ControlPurpose): RslUsageToken | null {
  switch (purpose) {
    case 'train':
      return 'ai-train';
    case 'ai_input':
      return 'ai-input';
    case 'ai_search':
      return 'ai-search';
    case 'search':
      return 'search';
    // No RSL equivalent for these
    case 'crawl':
    case 'index':
    case 'inference':
      return null;
    default:
      return null;
  }
}

/**
 * Get all known RSL usage tokens
 *
 * @returns Array of all known RSL usage tokens
 */
export function getKnownRslTokens(): RslUsageToken[] {
  return ['ai-train', 'ai-input', 'ai-search', 'search', 'ai-all'];
}

/**
 * Parse RSL rule from a simple string representation
 *
 * Parses a comma-separated list of RSL usage tokens.
 * This is a minimal parser for v0.9.17; full robots.txt
 * License: directive parsing is out of scope.
 *
 * @param input - Comma-separated usage tokens
 * @returns RslRule with parsed tokens
 *
 * @example
 * ```ts
 * const rule = parseRslTokenString('ai-train, ai-input');
 * // rule.tokens = ['ai-train', 'ai-input']
 * ```
 */
export function parseRslTokenString(input: string): RslRule {
  const tokens = input
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0) as RslUsageToken[];

  return {
    tokens,
    allow: true,
  };
}
