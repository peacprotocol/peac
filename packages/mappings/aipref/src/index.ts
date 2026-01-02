/**
 * IETF AIPREF Vocabulary Mapping for PEAC
 *
 * Maps IETF AIPREF Content-Usage header keys to PEAC CanonicalPurpose values.
 * Key-preserving approach: unknown keys are preserved, not dropped.
 *
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-aipref-vocab
 * @packageDocumentation
 */

import type { CanonicalPurpose, PurposeToken } from '@peac/schema';
import type {
  AiprefKey,
  AiprefKnownKey,
  AiprefStandardKey,
  AiprefExtensionKey,
  AiprefMappingResult,
  AiprefBatchMappingResult,
  ContentUsageParseResult,
} from './types.js';

export type {
  AiprefKey,
  AiprefKnownKey,
  AiprefStandardKey,
  AiprefExtensionKey,
  AiprefMappingResult,
  AiprefBatchMappingResult,
  ContentUsageParseResult,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * IETF AIPREF standard keys (normative from IETF draft)
 */
export const AIPREF_STANDARD_KEYS: readonly AiprefStandardKey[] = ['train-ai', 'search'] as const;

/**
 * AIPREF extension keys (deployed in wild, not yet standardized)
 */
export const AIPREF_EXTENSION_KEYS: readonly AiprefExtensionKey[] = ['train-genai', 'ai'] as const;

/**
 * All known AIPREF keys (standard + extensions)
 */
export const AIPREF_KNOWN_KEYS: readonly AiprefKnownKey[] = [
  ...AIPREF_STANDARD_KEYS,
  ...AIPREF_EXTENSION_KEYS,
] as const;

/**
 * Standard key mapping (IETF normative)
 */
const AIPREF_STANDARD_TO_CANONICAL: Record<AiprefStandardKey, CanonicalPurpose> = {
  'train-ai': 'train',
  search: 'search',
};

/**
 * Extension key mapping (with audit notes)
 */
const AIPREF_EXTENSION_TO_CANONICAL: Record<
  AiprefExtensionKey,
  { canonical: CanonicalPurpose; note: string }
> = {
  'train-genai': { canonical: 'train', note: 'Extension key, mapped to train' },
  ai: { canonical: 'train', note: 'Legacy key, mapped to train' },
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a key is a known AIPREF standard key
 */
export function isAiprefStandardKey(key: string): key is AiprefStandardKey {
  return (AIPREF_STANDARD_KEYS as readonly string[]).includes(key);
}

/**
 * Check if a key is a known AIPREF extension key
 */
export function isAiprefExtensionKey(key: string): key is AiprefExtensionKey {
  return (AIPREF_EXTENSION_KEYS as readonly string[]).includes(key);
}

/**
 * Check if a key is any known AIPREF key (standard or extension)
 */
export function isAiprefKnownKey(key: string): key is AiprefKnownKey {
  return isAiprefStandardKey(key) || isAiprefExtensionKey(key);
}

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Map a single AIPREF key to PEAC CanonicalPurpose
 *
 * Key-preserving: unknown keys return canonical=null but preserved=key.
 *
 * @param key - AIPREF key to map
 * @returns Mapping result with canonical purpose (or null) and preserved key
 *
 * @example
 * ```typescript
 * const result = aiprefKeyToCanonicalPurpose('train-ai');
 * // { canonical: 'train', preserved: 'train-ai' }
 *
 * const unknown = aiprefKeyToCanonicalPurpose('custom-key');
 * // { canonical: null, preserved: 'custom-key', mapping_note: 'Unknown AIPREF key' }
 * ```
 */
export function aiprefKeyToCanonicalPurpose(key: AiprefKey): AiprefMappingResult {
  const normalized = key.toLowerCase().trim();

  // Standard key mapping
  if (isAiprefStandardKey(normalized)) {
    return {
      canonical: AIPREF_STANDARD_TO_CANONICAL[normalized],
      preserved: normalized as PurposeToken,
    };
  }

  // Extension key mapping
  if (isAiprefExtensionKey(normalized)) {
    const { canonical, note } = AIPREF_EXTENSION_TO_CANONICAL[normalized];
    return {
      canonical,
      preserved: normalized as PurposeToken,
      mapping_note: note,
    };
  }

  // Unknown key: preserve but return null canonical
  return {
    canonical: null,
    preserved: normalized as PurposeToken,
    mapping_note: 'Unknown AIPREF key',
  };
}

/**
 * Map PEAC CanonicalPurpose back to AIPREF standard key
 *
 * Reverse mapping for generating AIPREF-compatible output.
 * Only returns standard keys, not extension keys.
 *
 * @param purpose - PEAC CanonicalPurpose
 * @returns AIPREF standard key or null if no direct mapping
 *
 * @example
 * ```typescript
 * canonicalPurposeToAiprefKey('train');  // 'train-ai'
 * canonicalPurposeToAiprefKey('search'); // 'search'
 * canonicalPurposeToAiprefKey('index');  // null (no AIPREF equivalent)
 * ```
 */
export function canonicalPurposeToAiprefKey(purpose: CanonicalPurpose): AiprefStandardKey | null {
  switch (purpose) {
    case 'train':
      return 'train-ai';
    case 'search':
      return 'search';
    // No AIPREF equivalent for these
    case 'user_action':
    case 'inference':
    case 'index':
      return null;
    default:
      return null;
  }
}

/**
 * Map multiple AIPREF keys to PEAC purposes (batch operation)
 *
 * @param keys - Array of AIPREF keys to map
 * @returns Batch mapping result with purposes, preserved keys, and unknown keys
 *
 * @example
 * ```typescript
 * const result = mapAiprefKeys(['train-ai', 'search', 'custom-key']);
 * // {
 * //   purposes: ['train', 'search'],
 * //   preserved: ['train-ai', 'search', 'custom-key'],
 * //   unknown: ['custom-key'],
 * //   notes: ['Unknown AIPREF key: custom-key']
 * // }
 * ```
 */
export function mapAiprefKeys(keys: AiprefKey[]): AiprefBatchMappingResult {
  const purposes = new Set<CanonicalPurpose>();
  const preserved: PurposeToken[] = [];
  const unknown: string[] = [];
  const notes: string[] = [];

  for (const key of keys) {
    const result = aiprefKeyToCanonicalPurpose(key);
    preserved.push(result.preserved);

    if (result.canonical) {
      purposes.add(result.canonical);
    } else {
      unknown.push(key);
      notes.push(`Unknown AIPREF key: ${key}`);
    }

    if (result.mapping_note && result.canonical) {
      notes.push(`${key}: ${result.mapping_note}`);
    }
  }

  return {
    purposes: Array.from(purposes),
    preserved,
    unknown,
    notes,
  };
}

// =============================================================================
// Content-Usage Header Parsing (RFC 8941 Structured Fields)
// =============================================================================

/**
 * Parse Content-Usage header value
 *
 * Content-Usage is a Structured Fields dictionary (RFC 8941).
 * Format: `train-ai=?1, search=?0`
 *
 * This is a simplified parser for common cases. For full RFC 8941
 * compliance, use a dedicated structured fields library.
 *
 * @param headerValue - Raw Content-Usage header value
 * @returns Parsed result with key-value pairs
 *
 * @example
 * ```typescript
 * const result = parseContentUsageHeader('train-ai=?1, search=?0');
 * // { entries: Map { 'train-ai' => true, 'search' => false }, valid: true }
 * ```
 */
export function parseContentUsageHeader(headerValue: string): ContentUsageParseResult {
  const entries = new Map<string, boolean>();

  if (!headerValue || typeof headerValue !== 'string') {
    return {
      entries,
      raw: headerValue ?? '',
      valid: false,
      error: 'Empty or invalid header value',
    };
  }

  try {
    // Split by comma (RFC 8941 dictionary members)
    const parts = headerValue.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (!part) continue;

      // Parse key=value pair
      // Common formats: key=?1, key=?0, key (implies true)
      const eqIndex = part.indexOf('=');

      if (eqIndex === -1) {
        // Key without value implies true
        const key = part.toLowerCase().trim();
        if (key) entries.set(key, true);
      } else {
        const key = part.slice(0, eqIndex).toLowerCase().trim();
        const value = part.slice(eqIndex + 1).trim();

        // RFC 8941 boolean: ?1 = true, ?0 = false
        if (value === '?1' || value === 'true' || value === 'y' || value === 'yes') {
          entries.set(key, true);
        } else if (value === '?0' || value === 'false' || value === 'n' || value === 'no') {
          entries.set(key, false);
        } else {
          // Treat unknown values as true for forward compatibility
          entries.set(key, true);
        }
      }
    }

    return {
      entries,
      raw: headerValue,
      valid: true,
    };
  } catch {
    return {
      entries,
      raw: headerValue,
      valid: false,
      error: 'Failed to parse Content-Usage header',
    };
  }
}

/**
 * Convert Content-Usage header to PEAC purposes
 *
 * Parses the header and maps allowed keys to CanonicalPurpose.
 * Only includes purposes where the value is true (allowed).
 *
 * @param headerValue - Raw Content-Usage header value
 * @returns Batch mapping result
 *
 * @example
 * ```typescript
 * const result = contentUsageToCanonicalPurposes('train-ai=?1, search=?0');
 * // {
 * //   purposes: ['train'],  // search excluded because =?0
 * //   preserved: ['train-ai', 'search'],
 * //   unknown: [],
 * //   notes: []
 * // }
 * ```
 */
export function contentUsageToCanonicalPurposes(headerValue: string): AiprefBatchMappingResult {
  const parsed = parseContentUsageHeader(headerValue);

  if (!parsed.valid) {
    return {
      purposes: [],
      preserved: [],
      unknown: [],
      notes: [parsed.error ?? 'Parse error'],
    };
  }

  // Only include keys where value is true (allowed)
  const allowedKeys = Array.from(parsed.entries.entries())
    .filter(([, allowed]) => allowed)
    .map(([key]) => key);

  return mapAiprefKeys(allowedKeys);
}

/**
 * Generate Content-Usage header value from PEAC purposes
 *
 * @param purposes - Array of CanonicalPurpose values
 * @param defaults - Default values for purposes not in the array
 * @returns Content-Usage header value
 *
 * @example
 * ```typescript
 * canonicalPurposesToContentUsage(['train', 'search']);
 * // 'train-ai=?1, search=?1'
 *
 * canonicalPurposesToContentUsage(['train'], { search: false });
 * // 'train-ai=?1, search=?0'
 * ```
 */
export function canonicalPurposesToContentUsage(
  purposes: CanonicalPurpose[],
  defaults?: Partial<Record<AiprefStandardKey, boolean>>
): string {
  const parts: string[] = [];

  // Add allowed purposes
  for (const purpose of purposes) {
    const key = canonicalPurposeToAiprefKey(purpose);
    if (key) {
      parts.push(`${key}=?1`);
    }
  }

  // Add explicit denials from defaults
  if (defaults) {
    for (const [key, allowed] of Object.entries(defaults)) {
      if (!allowed && !parts.some((p) => p.startsWith(`${key}=`))) {
        parts.push(`${key}=?0`);
      }
    }
  }

  return parts.join(', ');
}
