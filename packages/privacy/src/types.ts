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
 *
 * By default, salt is REQUIRED to prevent rainbow table attacks.
 * Set unsafeAllowUnsalted=true only for non-sensitive test data.
 */
export interface HashOptions {
  /** Salt for hashing (REQUIRED unless unsafeAllowUnsalted=true) */
  salt?: string;
  /** Algorithm to use (default: sha256) */
  algorithm?: 'sha256' | 'sha384' | 'sha512';
  /**
   * Allow unsalted hashing. UNSAFE for production use with PII.
   * Only use for non-sensitive data or testing.
   */
  unsafeAllowUnsalted?: boolean;
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
