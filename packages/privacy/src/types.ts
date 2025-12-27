/**
 * Privacy types for PEAC Protocol
 */

/**
 * Privacy level for data handling
 */
export type PrivacyLevel = 'public' | 'internal' | 'sensitive' | 'restricted';

/**
 * Classification hint for receipts (advisory)
 */
export interface ClassificationHint {
  /** Privacy level of the data */
  level: PrivacyLevel;
  /** Optional category (e.g., "pii", "financial", "health") */
  category?: string;
  /** Optional retention period in days */
  retentionDays?: number;
}

/**
 * Options for hashing identifiers
 */
export interface HashOptions {
  /** Salt for hashing (required for deterministic hashes) */
  salt?: string;
  /** Algorithm to use (default: sha256) */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
}

/**
 * Result of a hash operation
 */
export interface HashResult {
  /** The hashed value (hex-encoded) */
  hash: string;
  /** Algorithm used */
  algorithm: string;
  /** Whether salt was applied */
  salted: boolean;
}
