/**
 * x402 V2 raw HTTP transport types (Layer A)
 *
 * Exact mirror of upstream x402-foundation/x402 V2 HTTP transport spec at
 * specs/transports-v2/http.md.
 *
 * V2 moves all protocol data to HTTP headers (Base64-encoded JSON):
 * - PAYMENT-REQUIRED: challenge (server -> client)
 * - PAYMENT-SIGNATURE: payment proof (client -> server)
 * - PAYMENT-RESPONSE: settlement result (server -> client)
 *
 * These are decoded raw transport objects. Base64 header decoding is
 * transport-boundary handling and is NOT part of these type definitions.
 *
 * Types in this file MUST match upstream V2 transport spec exactly.
 * Do NOT rename fields, add PEAC-specific fields, or change types.
 * Normalization belongs in Layer B (normalize-v2.ts, PR5).
 *
 * Upstream pin: x402-foundation/x402 specs/transports-v2/http.md
 * Weekly drift CI: .github/workflows/x402-drift.yml
 */

// ---------------------------------------------------------------------------
// Shared: Resource
// ---------------------------------------------------------------------------

/**
 * Resource descriptor (shared across challenge, payment, and response).
 * Describes the resource being accessed behind the 402 paywall.
 */
export interface RawV2Resource {
  url: string;
  description: string;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// PAYMENT-REQUIRED (402 Challenge)
// ---------------------------------------------------------------------------

/**
 * Accept entry in a V2 payment challenge.
 * Each entry describes one acceptable payment method.
 */
export interface RawV2PaymentRequiredAccept {
  /** Payment scheme (e.g., "exact") */
  scheme: string;
  /** CAIP-2 network identifier (e.g., "eip155:84532") */
  network: string;
  /** Payment amount in minor units */
  amount: string;
  /** Token/asset identifier (e.g., hex token address) */
  asset: string;
  /** Payment recipient address */
  payTo: string;
  /** Maximum timeout for payment settlement in seconds */
  maxTimeoutSeconds: number;
  /** Scheme-specific additional data */
  extra: Record<string, unknown>;
}

/**
 * V2 PaymentRequired payload.
 *
 * Sent in the PAYMENT-REQUIRED header (Base64-encoded JSON) as part
 * of a 402 Payment Required response. This is the challenge that tells
 * the client what payment is needed.
 */
export interface RawV2PaymentRequired {
  /** Protocol version (V2: always 2) */
  x402Version: 2;
  /** Error message describing why payment is required */
  error: string;
  /** Resource being accessed */
  resource: RawV2Resource;
  /** Array of acceptable payment methods */
  accepts: RawV2PaymentRequiredAccept[];
}

// ---------------------------------------------------------------------------
// PAYMENT-SIGNATURE (Client Payment Proof)
// ---------------------------------------------------------------------------

/**
 * Authorization data within a V2 payment payload.
 * Contains the on-chain authorization details for the payment.
 */
export interface RawV2PaymentAuthorization {
  /** Payer address */
  from: string;
  /** Payee address */
  to: string;
  /** Payment amount */
  value: string;
  /** Valid-after timestamp (unix) */
  validAfter: string;
  /** Valid-before timestamp (unix) */
  validBefore: string;
  /** Nonce (hex string) */
  nonce: string;
}

/**
 * Payment proof body within a V2 payment payload.
 */
export interface RawV2PaymentProofBody {
  /** Hex-encoded signature */
  signature: string;
  /** On-chain authorization details */
  authorization: RawV2PaymentAuthorization;
}

/**
 * V2 PaymentPayload.
 *
 * Sent in the PAYMENT-SIGNATURE header (Base64-encoded JSON) alongside
 * the actual HTTP request. Contains the payment proof.
 */
export interface RawV2PaymentPayload {
  /** Protocol version (V2: always 2) */
  x402Version: 2;
  /** Resource being paid for */
  resource: RawV2Resource;
  /** The accepted payment method (single entry from accepts[]) */
  accepted: RawV2PaymentRequiredAccept;
  /** Payment proof data */
  payload: RawV2PaymentProofBody;
}

// ---------------------------------------------------------------------------
// PAYMENT-RESPONSE (Settlement Result)
// ---------------------------------------------------------------------------

/**
 * V2 SettlementResponse (success).
 *
 * Sent in the PAYMENT-RESPONSE header (Base64-encoded JSON) when
 * payment settlement succeeds.
 */
export interface RawV2SettlementResponseSuccess {
  success: true;
  /** On-chain transaction hash */
  transaction: string;
  /** CAIP-2 network identifier */
  network: string;
  /** Payer address */
  payer: string;
  /**
   * Upstream protocol-extensions data (optional).
   *
   * Mirrors `SettleResponse.extensions?: Record<string, unknown>` from
   * upstream x402-foundation/x402
   * (`typescript/packages/core/src/types/facilitator.ts`), a generic
   * protocol-extension passthrough field that pre-dates the offer-receipt
   * extension (PR #1003). The "Signed Offers & Receipts" extension places
   * a signed receipt at `extensions["offer-receipt"].info.receipt`
   * (specs/extensions/extension-offer-and-receipt.md Section 5.1, pinned
   * commit f2bbb5c); sibling extensions (e.g. batch-settlement) may use
   * other keys under this same bag. Raw pass-through only: no PEAC
   * semantics are added at this layer (see normalize-v2.ts / map.ts).
   */
  extensions?: Record<string, unknown>;
}

/**
 * V2 SettlementResponse (failure).
 *
 * Sent in the PAYMENT-RESPONSE header when settlement fails.
 */
export interface RawV2SettlementResponseFailure {
  success: false;
  /** Error reason (e.g., "insufficient_funds") */
  errorReason: string;
  /** Empty string on failure */
  transaction: string;
  /** CAIP-2 network identifier */
  network: string;
  /** Payer address */
  payer: string;
  /**
   * Upstream protocol-extensions data (optional).
   *
   * See `RawV2SettlementResponseSuccess.extensions` for the field's
   * provenance and semantics. Present on the unified upstream
   * `SettleResponse` shape regardless of `success`; PEAC's V2
   * normalization (`normalizeV2Receipt`) only carries it forward on the
   * success path, since failed settlements do not produce a receipt.
   */
  extensions?: Record<string, unknown>;
}

/** Discriminated union of V2 settlement response outcomes */
export type RawV2SettlementResponse =
  | RawV2SettlementResponseSuccess
  | RawV2SettlementResponseFailure;

// ---------------------------------------------------------------------------
// V2 Header Constants
// ---------------------------------------------------------------------------

/**
 * V2 HTTP header names (lowercase for case-insensitive matching).
 * All carry Base64-encoded JSON payloads.
 */
export const X402_V2_HEADERS = {
  /** Server challenge header (402 response) */
  PAYMENT_REQUIRED: 'payment-required',
  /** Client payment proof header (request) */
  PAYMENT_SIGNATURE: 'payment-signature',
  /** Server settlement result header (response) */
  PAYMENT_RESPONSE: 'payment-response',
} as const;
