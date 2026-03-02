/**
 * Wire 0.2 pure primitive types (v0.12.0-preview.1, DD-156)
 *
 * This file contains ONLY types whose fields are built-in TypeScript primitives
 * (string, number). No imports from @peac/schema or any other package.
 *
 * Wire02Claims (the full envelope type) lives in @peac/schema as
 * z.infer<typeof Wire02ClaimsSchema> -- it cannot be here because it references
 * ActorBinding and other schema-layer types (Layer 0 cannot import Layer 1).
 */

/**
 * Policy binding block for Wire 0.2 envelopes (DD-151).
 *
 * Records a cryptographic reference to the policy document that governed
 * this interaction. The digest MUST be the JCS+SHA-256 of the policy JSON
 * (RFC 8785 canonicalization + SHA-256, formatted as 'sha256:<64 hex>').
 */
export interface PolicyBlock {
  /** JCS+SHA-256 digest of the policy document: 'sha256:<64 lowercase hex>' */
  digest: string;
  /** HTTPS locator hint for the policy document. MUST NOT trigger auto-fetch (DD-55). */
  uri?: string;
  /** Caller-assigned version label for the policy. */
  version?: string;
}

/**
 * Representation fields for Wire 0.2 envelopes (DD-152).
 *
 * Records metadata about the content representation that was observed or served,
 * enabling reproducible content drift detection.
 * Maps to RepresentationObservation (DD-103) at the schema layer.
 */
export interface RepresentationFields {
  /** FingerprintRef of the served content body: 'sha256:<64 lowercase hex>' */
  content_hash?: string;
  /** MIME type of the served content (e.g., 'text/markdown') */
  content_type?: string;
  /** Size of the served content in bytes */
  content_length?: number;
}

/**
 * A verification warning emitted during Wire 0.2 parsing or verification (DD-155).
 *
 * Warnings do NOT affect the allow/deny decision unless caller policy requires it.
 * Warning codes are append-only stable string literals.
 * Warnings MUST be sorted by (pointer ascending, code ascending);
 * undefined pointer sorts before any string value.
 *
 * RFC 6901 JSON Pointer escaping: '/' in keys is escaped as '~1', '~' as '~0'.
 * Example: "/extensions/org.peacprotocol~1commerce/amount_minor"
 */
export interface VerificationWarning {
  /** Stable, append-only warning code string */
  code: string;
  /** Human-readable description of the warning */
  message: string;
  /** RFC 6901 JSON Pointer to the field that triggered the warning */
  pointer?: string;
}
