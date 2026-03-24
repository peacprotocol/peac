/**
 * Shared metadata sanitization for Stripe rail adapters.
 *
 * Single source of truth for privacy behavior across all Stripe evidence
 * paths (fiat, crypto, SPT). Prevents silent divergence in invisible-char
 * stripping, key/value limits, and allowlist enforcement.
 */

/** Metadata inclusion policy */
export type MetadataPolicy = 'omit' | 'passthrough' | 'allowlist';

/** Maximum metadata entries when included */
export const METADATA_MAX_KEYS = 20;

/** Maximum metadata key length */
export const METADATA_MAX_KEY_LENGTH = 40;

/** Maximum metadata value length */
export const METADATA_MAX_VALUE_LENGTH = 500;

/** Regex matching invisible Unicode characters (zero-width, direction overrides, BOM) */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/** Strip invisible/bidi/control characters */
export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE_RE, '');
}

/**
 * Sanitize metadata per policy.
 *
 * - 'omit': returns undefined (metadata excluded)
 * - 'passthrough': all keys included, bounded by limits
 * - 'allowlist': only specified keys included, bounded by limits
 *
 * All modes strip invisible Unicode characters and enforce
 * max key count, key length, and value length.
 */
export function sanitizeMetadata(
  raw: Record<string, string>,
  policy: MetadataPolicy,
  allowedKeys?: string[]
): Record<string, string> | undefined {
  if (policy === 'omit') return undefined;

  let entries = Object.entries(raw);

  if (policy === 'allowlist') {
    const allowed = new Set(allowedKeys ?? []);
    entries = entries.filter(([key]) => allowed.has(key));
  }

  entries = entries.slice(0, METADATA_MAX_KEYS);

  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    const cleanKey = stripInvisible(key).slice(0, METADATA_MAX_KEY_LENGTH);
    const cleanValue = stripInvisible(String(value)).slice(0, METADATA_MAX_VALUE_LENGTH);
    if (cleanKey.length > 0) {
      result[cleanKey] = cleanValue;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
