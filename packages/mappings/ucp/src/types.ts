/**
 * @peac/mappings-ucp - Type definitions
 *
 * Google Universal Commerce Protocol (UCP) types and evidence schema.
 * UCP webhooks use detached JWS (RFC 7797) with ES256/ES384/ES512.
 */

/**
 * UCP Evidence schema version.
 * Used in policy/policy.yaml for dispute bundles.
 */
export const UCP_EVIDENCE_VERSION = 'org.peacprotocol.ucp/0.1' as const;

/**
 * Supported JWS algorithms for UCP webhook signatures.
 * ES256 is most common, ES384/ES512 for higher security.
 */
export type UcpSignatureAlgorithm = 'ES256' | 'ES384' | 'ES512';

/**
 * UCP amounts are in minor units (cents), NOT micros.
 * e.g., $10.00 = 1000 (cents)
 */
export type MinorUnits = number;

/**
 * Verification mode for webhook signatures.
 * - 'raw': Verify against raw request body bytes
 * - 'jcs': Verify against JCS-canonicalized body
 */
export type VerificationMode = 'raw' | 'jcs';

/**
 * b64 header parameter for detached JWS.
 * - true: Payload is base64url-encoded before signing (default per RFC 7515)
 * - false: Payload bytes used directly (RFC 7797 unencoded payload)
 * - undefined: Treat as true per spec
 */
export type B64Mode = true | false | undefined;

/**
 * Parsed JWS header for UCP signatures.
 */
export interface UcpJwsHeader {
  /** Algorithm (ES256, ES384, ES512) */
  alg: UcpSignatureAlgorithm;

  /** Key ID referencing signing_keys in UCP profile */
  kid: string;

  /** b64 parameter (RFC 7797) */
  b64?: boolean;

  /** Critical headers that MUST be understood */
  crit?: string[];

  /** Type (typically 'JWT') */
  typ?: string;
}

/**
 * Result of parsing a detached JWS from Request-Signature header.
 */
export interface ParsedDetachedJws {
  /** Original header string value */
  raw_header_value: string;

  /** Parsed protected header */
  header: UcpJwsHeader;

  /** Base64url-encoded protected header */
  protected_b64url: string;

  /** Base64url-encoded signature */
  signature_b64url: string;

  /** Whether b64=false was specified */
  is_unencoded_payload: boolean;
}

/**
 * UCP signing key from business profile.
 */
export interface UcpSigningKey {
  /** Key type (EC for ECDSA) */
  kty: 'EC';

  /** Curve (P-256, P-384, P-521) */
  crv: 'P-256' | 'P-384' | 'P-521';

  /** Key ID */
  kid: string;

  /** X coordinate (base64url) */
  x: string;

  /** Y coordinate (base64url) */
  y: string;

  /** Algorithm */
  alg?: UcpSignatureAlgorithm;

  /** Key use */
  use?: 'sig';
}

/**
 * UCP business profile (from /.well-known/ucp).
 */
export interface UcpProfile {
  /** Profile version */
  version: string;

  /** Business ID */
  business_id: string;

  /** Signing keys for webhook verification */
  signing_keys: UcpSigningKey[];

  /** Capabilities supported */
  capabilities?: UcpCapability[];
}

/**
 * UCP capability declaration.
 */
export interface UcpCapability {
  /** Capability name (e.g., 'dev.ucp.shopping.order') */
  name: string;

  /** Capability version */
  version: string;

  /** Capability config */
  config?: Record<string, unknown>;
}

/**
 * Verification attempt record for evidence.
 */
export interface VerificationAttempt {
  /** Mode attempted */
  mode: VerificationMode;

  /** Whether this attempt succeeded */
  success: boolean;

  /** Error code if failed */
  error_code?: string;

  /** Error message if failed */
  error_message?: string;
}

/**
 * Payload representation for evidence.
 * Stores both raw and JCS forms for reproducible verification.
 */
export interface PayloadEvidence {
  /** SHA-256 hash of raw request body bytes (hex) */
  raw_sha256_hex: string;

  /** Raw body bytes as base64url (optional, recommended for <= 256KB) */
  raw_bytes_b64url?: string;

  /** SHA-256 hash of JCS-canonicalized body (hex, if JSON parseable) */
  jcs_sha256_hex?: string;

  /** JCS-canonicalized JSON text (optional, for human review) */
  jcs_text?: string;

  /** Whether JSON parsing succeeded */
  json_parseable: boolean;
}

/**
 * Signature evidence for dispute bundle.
 */
export interface SignatureEvidence {
  /** Full Request-Signature header value */
  header_value: string;

  /** Parsed key ID */
  kid: string;

  /** Parsed algorithm */
  alg: UcpSignatureAlgorithm;

  /** b64 mode (true, false, or absent -> null) */
  b64: boolean | null;

  /** Critical headers if present */
  crit?: string[];

  /** Whether verification succeeded */
  verified: boolean;

  /** Which verification mode succeeded */
  verification_mode_used?: VerificationMode;

  /** All verification attempts (for debugging) */
  verification_attempts: VerificationAttempt[];
}

/**
 * Profile snapshot for offline audit.
 */
export interface ProfileSnapshot {
  /** Profile URL */
  url: string;

  /** When profile was fetched (ISO 8601) */
  fetched_at: string;

  /** SHA-256 of JCS-canonicalized profile JSON (hex) */
  profile_jcs_sha256_hex: string;

  /** JWK thumbprint of the key used (RFC 7638) */
  key_thumbprint?: string;

  /** Full JWK used (for offline verification) */
  key_jwk?: UcpSigningKey;
}

/**
 * UCP webhook event metadata.
 */
export interface WebhookEventMeta {
  /** Event type (e.g., 'order.created') */
  type: string;

  /** Resource ID (e.g., order_id) */
  resource_id?: string;

  /** Event timestamp from payload (ISO 8601) */
  timestamp?: string;
}

/**
 * Complete UCP webhook evidence for dispute bundle.
 * Stored in policy/policy.yaml with fixed key ordering.
 */
export interface UcpWebhookEvidence {
  /** Schema version - prevents misinterpretation as executable policy */
  peac_bundle_metadata_version: typeof UCP_EVIDENCE_VERSION;

  /** Kind marker - clearly not executable policy */
  kind: 'evidence_attachment';

  /** Evidence scope */
  scope: 'ucp_webhook';

  /** Webhook request metadata */
  request: {
    /** HTTP method */
    method: string;

    /** Request path */
    path: string;

    /** When request was received (ISO 8601, injected for determinism) */
    received_at: string;
  };

  /** Payload evidence with both raw and JCS representations */
  payload: PayloadEvidence;

  /** Signature evidence */
  signature: SignatureEvidence;

  /** Event metadata from payload */
  event?: WebhookEventMeta;

  /** Business profile snapshot */
  profile: ProfileSnapshot;

  /** Links to PEAC receipts in this bundle */
  linked_receipts?: LinkedReceipt[];
}

/**
 * Link to a PEAC receipt in the same bundle.
 */
export interface LinkedReceipt {
  /** Receipt ID (jti claim) */
  receipt_id: string;

  /** Relationship to the webhook event */
  relationship: 'issued_for_order' | 'issued_for_checkout' | 'issued_for_adjustment';
}

/**
 * Options for verifying a UCP webhook signature.
 */
export interface VerifyUcpWebhookOptions {
  /** Request-Signature header value */
  signature_header: string;

  /** Raw request body bytes */
  body_bytes: Uint8Array;

  /** Profile URL for key discovery */
  profile_url: string;

  /** Optional: pre-fetched profile (skips fetch) */
  profile?: UcpProfile;

  /** Optional: timestamp for profile fetch (for deterministic evidence) */
  fetched_at?: string;

  /** Optional: maximum body size to include in evidence (default 256KB) */
  max_body_evidence_bytes?: number;
}

/**
 * Result of UCP webhook signature verification.
 * Includes profile and key for single-fetch evidence capture.
 */
export interface VerifyUcpWebhookResult {
  /** Whether signature is valid */
  valid: boolean;

  /** Which verification mode succeeded (if valid) */
  mode_used?: VerificationMode;

  /** Parsed header info */
  header: UcpJwsHeader;

  /** Key used for verification */
  key?: UcpSigningKey;

  /** Fetched profile (for evidence capture - avoids double-fetch) */
  profile?: UcpProfile;

  /** Raw profile JSON string (for deterministic hashing) */
  profile_raw?: string;

  /** All verification attempts */
  attempts: VerificationAttempt[];

  /** Error code (if invalid) */
  error_code?: string;

  /** Error message (if invalid) */
  error_message?: string;
}

// ---------------------------------------------------------------------------
// RFC 9421 HTTP Message Signature verification (current UCP signing model)
// ---------------------------------------------------------------------------

/**
 * HTTP Message Signature algorithm (RFC 9421) supported for UCP.
 *
 * UCP requires ES256 (P-256); ES384 (P-384) is OPTIONAL. Ed25519 is not used
 * at the UCP wire layer, so it is intentionally excluded here.
 *
 * This is the algorithm RESOLVED from the signing key's curve (P-256 -> ES256,
 * P-384 -> ES384), not a value read from the `Signature-Input` `alg` parameter:
 * UCP does not include `alg` in `Signature-Input`.
 */
export type UcpHttpSignatureAlgorithm = 'ES256' | 'ES384';

/**
 * Required signed-component policy for UCP HTTP Message Signature verification.
 *
 * - `ucp-request` (default): the full UCP request policy. Always requires
 *   `@method`, `@authority`, `@path`; `@query` when the URL has a query string;
 *   `ucp-agent` when a `UCP-Agent` header is present; `idempotency-key` for
 *   state-changing methods (POST/PUT/DELETE/PATCH); and `content-digest` +
 *   `content-type` when a body is present. This also applies to webhook
 *   deliveries: UCP does not define a separate webhook component set, and
 *   webhook POSTs are not exempt from the idempotency-key requirement.
 * - `signature-only`: low-level mode. Verifies the signature and, when a body is
 *   present and covered, the Content-Digest, but does NOT enforce the required
 *   component set. Use only when the caller enforces component coverage itself.
 *
 * Note: UCP response signatures use `@status` instead of `@method` and are a
 * separate component model; this verifier covers request-shaped signatures only.
 */
export type UcpComponentPolicy = 'ucp-request' | 'signature-only';

/**
 * Options for verifying a UCP request/webhook RFC 9421 HTTP Message Signature.
 *
 * This is the current UCP signing model (`Signature-Input` / `Signature` /
 * `Content-Digest` over raw body bytes), distinct from the legacy
 * `Request-Signature` detached-JWS path verified by `verifyUcpWebhookSignature`.
 * There is no silent fallback between the two: the caller selects the scheme.
 */
export interface VerifyUcpHttpSignatureOptions {
  /** RFC 9421 `Signature-Input` header value. */
  signature_input: string;

  /** RFC 9421 `Signature` header value. */
  signature: string;

  /** HTTP method (e.g. 'POST'). */
  method: string;

  /** Absolute request URL (used for `@authority` / `@path` / `@query` derived components). */
  url: string;

  /** Request headers (case-insensitive lookup; e.g. `content-digest`, `ucp-agent`). */
  headers: Record<string, string>;

  /**
   * Raw request body bytes. Required (and bound via `content-digest`) whenever a
   * body is present; never JSON-canonicalized before digesting (UCP binds raw bytes).
   */
  body_bytes?: Uint8Array;

  /**
   * Pre-resolved UCP party profile (the `/.well-known/ucp` document). Resolving it
   * is the caller's responsibility (SSRF-safe, host-allowlisted); tests pass a fixture.
   * No network I/O happens inside this function.
   */
  profile: UcpProfile;

  /** Optional specific signature label to verify (defaults to the first in `Signature-Input`). */
  label?: string;

  /**
   * Required signed-component policy. Defaults to `'ucp-request'` (strict). Use
   * `'signature-only'` for low-level verification without component enforcement.
   */
  component_policy?: UcpComponentPolicy;

  /**
   * Optional expected signer profile URL to bind. When provided, the `ucp-agent`
   * component MUST be signed, the `UCP-Agent` header MUST be present and parse as
   * an RFC 8941 dictionary with a quoted HTTPS `profile` member, and that profile
   * URL MUST equal this value; otherwise verification fails. An unsigned component
   * is never trusted. This verifier never fetches the profile URL (SSRF stays out).
   */
  expected_profile_url?: string;
}

/**
 * Result of verifying a UCP RFC 9421 HTTP Message Signature.
 */
export interface VerifyUcpHttpSignatureResult {
  /** Whether the signature (and `Content-Digest`, when present) verified. */
  valid: boolean;

  /** Algorithm resolved from the signing key's curve (P-256 -> ES256, P-384 -> ES384). */
  alg?: UcpHttpSignatureAlgorithm;

  /** `keyid` from `Signature-Input`, matched against `signing_keys[].kid`. */
  keyid?: string;

  /** Covered components from `Signature-Input` (for evidence capture). */
  covered_components?: string[];

  /** Whether a `Content-Digest` was present and verified over the raw body bytes. */
  content_digest_verified?: boolean;

  /**
   * The signer profile URL parsed from a signed `UCP-Agent` header, when one was
   * present and validated (evidence for the caller; never fetched here).
   */
  signer_profile_url?: string;

  /** Error code (`E_UCP_*`) when invalid. */
  error_code?: string;

  /** Error message when invalid. */
  error_message?: string;
}

/**
 * UCP order line item for receipt mapping.
 */
export interface UcpLineItem {
  /** Line item ID */
  id: string;

  /** Item details */
  item: {
    id: string;
    title: string;
    price: MinorUnits;
  };

  /** Quantities */
  quantity: {
    total: number;
    fulfilled: number;
  };

  /** Status */
  status: 'processing' | 'partial' | 'fulfilled';
}

/**
 * UCP order for receipt mapping.
 */
export interface UcpOrder {
  /** Order ID */
  id: string;

  /** Checkout ID that created this order */
  checkout_id?: string;

  /** Order permalink */
  permalink_url?: string;

  /** Line items */
  line_items: UcpLineItem[];

  /** Order totals */
  totals: Array<{
    type: 'subtotal' | 'shipping' | 'tax' | 'total' | string;
    amount: MinorUnits;
  }>;

  /** Fulfillment info */
  fulfillment?: {
    expectations: unknown[];
    events: unknown[];
  };

  /** Adjustments (refunds, returns, etc.) */
  adjustments?: unknown[];
}

// ---------------------------------------------------------------------------
// DD-187: Order-vs-payment semantic separation (v0.12.4+)
// ---------------------------------------------------------------------------

/** UCP order lifecycle state (distinct from payment state) */
export type UcpOrderState = 'processing' | 'partial' | 'completed';

/** UCP payment lifecycle state (requires explicit payment evidence) */
export type UcpPaymentState =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'settled'
  | 'failed'
  | 'refunded';

/**
 * Options for mapping UCP order to PEAC receipt claims.
 */
export interface MapUcpOrderOptions {
  /** UCP order object */
  order: UcpOrder;

  /** Issuer URI (PEAC publisher) */
  issuer: string;

  /** Subject URI (buyer/agent) */
  subject: string;

  /** Currency code (ISO 4217) */
  currency: string;

  /** Optional receipt ID (generated if not provided) */
  receipt_id?: string;

  /** Optional issued_at (for deterministic fixtures) */
  issued_at?: string;

  /**
   * Explicit payment state (DD-187, v0.12.4+).
   *
   * When provided, the commerce extension `event` field is derived from
   * this payment state, NOT from the order status. When absent, the
   * mapper produces order-lifecycle evidence only (no commerce event).
   *
   * This enforces the semantic boundary: order completion does not
   * prove payment settlement.
   */
  payment_state?: UcpPaymentState;
}

/**
 * PEAC receipt claims mapped from UCP order.
 */
export interface MappedReceiptClaims {
  /** Receipt ID */
  jti: string;

  /** Issuer */
  iss: string;

  /** Subject */
  sub: string;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Payment evidence */
  payment: {
    rail: 'ucp';
    currency: string;
    amount: MinorUnits;
    status: 'completed' | 'pending';
    evidence: {
      order_id: string;
      checkout_id?: string;
      line_items: number;
      totals: Record<string, MinorUnits>;
      /** DD-187: order lifecycle state (distinct from payment state) */
      order_state?: string;
      /** DD-187: explicit payment state when provided */
      payment_state?: string;
      /** DD-187: source of payment status derivation */
      payment_state_source?: 'explicit' | 'derived_order_fallback';
    };
  };

  /** UCP-specific extensions */
  ext: {
    'dev.ucp/order_id': string;
    'dev.ucp/checkout_id'?: string;
    'dev.ucp/order_status': string;
    /** DD-187: explicit payment state when provided */
    'dev.ucp/payment_state'?: string;
    'dev.ucp/permalink'?: string;
  };
}
