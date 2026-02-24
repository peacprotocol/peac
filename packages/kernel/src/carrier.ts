/**
 * Evidence Carrier Contract types (DD-124)
 *
 * Pure TypeScript types for the universal evidence carry interface.
 * Zero runtime dependencies: this module exports only types.
 *
 * The Evidence Carrier Contract defines how any protocol (MCP, A2A, ACP,
 * UCP, x402, HTTP) carries PEAC receipts without kernel changes.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Canonical HTTP header name for PEAC receipts (DD-127).
 *
 * The wire token is exactly "PEAC-Receipt" (mixed-case, hyphenated).
 * This is the only valid spelling in conformance fixtures and attach() output.
 * HTTP header lookups SHOULD be case-insensitive per RFC 9110, but conformance
 * fixtures and attach() output MUST use this exact spelling.
 */
export const PEAC_RECEIPT_HEADER = 'PEAC-Receipt' as const;

/**
 * Canonical HTTP header name for receipt URL locator hint (DD-135).
 *
 * HTTPS-only, max 2048 chars, no credentials.
 * MUST NOT trigger implicit fetch (DD-55).
 */
export const PEAC_RECEIPT_URL_HEADER = 'PEAC-Receipt-URL' as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Content-addressed receipt reference: SHA-256 of the compact JWS bytes */
export type ReceiptRef = `sha256:${string}`;

/** Carrier format: embed (inline) or reference (URL/pointer) */
export type CarrierFormat = 'embed' | 'reference';

// ---------------------------------------------------------------------------
// Core carrier type
// ---------------------------------------------------------------------------

/**
 * Universal evidence carrier.
 *
 * Every protocol-specific adapter produces and consumes this shape.
 * Fields marked optional are SHOULD or MAY per the carrier contract spec.
 */
export interface PeacEvidenceCarrier {
  /** Content-addressed receipt reference (MUST): sha256:<hex64> */
  receipt_ref: ReceiptRef;
  /** Compact JWS of the signed receipt (SHOULD for embed format) */
  receipt_jws?: string;
  /**
   * Locator hint for detached receipt resolution (DD-135).
   * HTTPS-only, max 2048 chars, no credentials.
   * MUST NOT trigger implicit fetch (DD-55).
   * If a caller fetches, it MUST verify sha256(receipt_jws) == receipt_ref.
   */
  receipt_url?: string;
  /** Policy binding hash for verification (MAY) */
  policy_binding?: string;
  /** Actor binding identifier (MAY) */
  actor_binding?: string;
  /** Request nonce for replay protection (MAY) */
  request_nonce?: string;
  /** Reference to a verification report (MAY) */
  verification_report_ref?: string;
  /** Reference to a use policy (MAY) */
  use_policy_ref?: string;
  /** Reference to a representation (MAY) */
  representation_ref?: string;
  /** Reference to an attestation (MAY) */
  attestation_ref?: string;
}

// ---------------------------------------------------------------------------
// Carrier metadata
// ---------------------------------------------------------------------------

/**
 * Transport-level metadata describing how a carrier is placed.
 *
 * Used by validateConstraints() to enforce transport-specific size limits
 * and format requirements (DD-127).
 */
export interface CarrierMeta {
  /** Transport identifier (e.g. 'mcp', 'a2a', 'acp', 'ucp', 'x402', 'http') */
  transport: string;
  /** Carrier format: embed or reference */
  format: CarrierFormat;
  /** Maximum carrier size in bytes for this transport */
  max_size: number;
  /** Fields that have been redacted (MAY) */
  redaction?: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

/** Result of carrier constraint validation */
export interface CarrierValidationResult {
  valid: boolean;
  violations: string[];
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Protocol-specific carrier adapter (DD-124).
 *
 * Each protocol mapping implements this interface to attach/extract
 * PEAC evidence carriers in the protocol's native format.
 *
 * @typeParam TInput - The protocol-specific input type (e.g. A2A TaskStatus)
 * @typeParam TOutput - The protocol-specific output type
 */
export interface CarrierAdapter<TInput, TOutput> {
  /**
   * Extract PEAC evidence carriers from a protocol message.
   * Returns null if no carrier is present.
   */
  extract(input: TInput): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null;

  /**
   * Attach PEAC evidence carriers to a protocol message.
   * Returns the modified output with carriers placed per protocol conventions.
   */
  attach(output: TOutput, carriers: PeacEvidenceCarrier[], meta?: CarrierMeta): TOutput;

  /**
   * Validate a carrier against transport-specific constraints (DD-127, DD-129).
   * Takes CarrierMeta for transport-aware size and format validation.
   */
  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult;
}
