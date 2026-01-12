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
    };
  };

  /** UCP-specific extensions */
  ext: {
    'dev.ucp/order_id': string;
    'dev.ucp/checkout_id'?: string;
    'dev.ucp/order_status': string;
    'dev.ucp/permalink'?: string;
  };
}
