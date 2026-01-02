/**
 * AIPREF Mapping Types
 *
 * Types for IETF AIPREF vocabulary mapping to PEAC canonical purposes.
 * Key-preserving approach: unknown keys are preserved, not dropped.
 */

import type { CanonicalPurpose, PurposeToken } from '@peac/schema';

/**
 * IETF AIPREF standard keys (draft-ietf-aipref-vocab-05)
 *
 * These are the normative keys from the IETF draft.
 */
export type AiprefStandardKey = 'train-ai' | 'search';

/**
 * AIPREF extension keys (deployed in the wild, not yet standardized)
 *
 * These keys are used by implementations but not in the IETF draft.
 */
export type AiprefExtensionKey = 'train-genai' | 'ai';

/**
 * All known AIPREF keys (standard + extensions)
 */
export type AiprefKnownKey = AiprefStandardKey | AiprefExtensionKey;

/**
 * Any AIPREF key (known or unknown)
 *
 * String type allows forward compatibility with new keys.
 */
export type AiprefKey = string;

/**
 * Result of mapping an AIPREF key to PEAC purpose
 *
 * Key-preserving: the original key is always in `preserved`.
 * `canonical` is null if the key is unknown.
 */
export interface AiprefMappingResult {
  /** Canonical PEAC purpose (null if unknown key) */
  canonical: CanonicalPurpose | null;

  /** Original AIPREF key (always preserved) */
  preserved: PurposeToken;

  /** Audit note explaining the mapping (optional) */
  mapping_note?: string;
}

/**
 * Result of parsing Content-Usage header
 */
export interface ContentUsageParseResult {
  /** Parsed key-value pairs */
  entries: Map<string, boolean>;

  /** Raw header value */
  raw: string;

  /** Whether parsing was successful */
  valid: boolean;

  /** Error message if parsing failed */
  error?: string;
}

/**
 * Batch mapping result for multiple AIPREF keys
 */
export interface AiprefBatchMappingResult {
  /** Successfully mapped canonical purposes */
  purposes: CanonicalPurpose[];

  /** All preserved keys (including unknown) */
  preserved: PurposeToken[];

  /** Unknown keys that couldn't be mapped */
  unknown: string[];

  /** Mapping notes for audit trail */
  notes: string[];
}
