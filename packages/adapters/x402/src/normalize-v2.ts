/**
 * x402 V2 semantic normalization (Layer B)
 *
 * V2 transport is JWS-primary with no EIP-712 placeholder semantics.
 * Optional fields are truly optional in V2, so placeholder normalization
 * (the core of V1 Layer B) is not needed.
 *
 * Instead, V2 normalization:
 * 1. Flattens the transport structure (PaymentRequired -> per-offer)
 * 2. Preserves all upstream fields including V2-specific ones
 *    (maxTimeoutSeconds, extra, resource metadata)
 * 3. Produces V2-specific normalized types that carry forward all semantics
 *
 * These V2 normalized types are NOT forced into V1 NormalizedOfferPayload.
 * Downstream mapping (map.ts) and verification (verify.ts) will handle
 * the V1/V2 split explicitly. That work belongs in the full PR5.
 */

import type {
  RawV2PaymentRequired,
  RawV2PaymentRequiredAccept,
  RawV2Resource,
  RawV2SettlementResponse,
} from './raw-v2.js';

// ---------------------------------------------------------------------------
// V2 Normalized Types
// ---------------------------------------------------------------------------

/**
 * V2 normalized offer (preserves all upstream semantics).
 *
 * Unlike V1 NormalizedOfferPayload, this carries V2-specific fields
 * like maxTimeoutSeconds, extra, and resource metadata.
 */
export interface NormalizedV2Offer {
  /** Protocol version (always 2) */
  version: 2;
  /** Resource being offered */
  resource: RawV2Resource;
  /** Settlement scheme */
  scheme: string;
  /** CAIP-2 network identifier */
  network: string;
  /** Payment asset identifier */
  asset: string;
  /** Payment recipient address */
  payTo: string;
  /** Payment amount in minor units */
  amount: string;
  /**
   * Maximum timeout for payment settlement in seconds.
   * V2-specific: NOT an epoch timestamp (unlike V1 validUntil).
   * Represents a duration, not an absolute time.
   */
  maxTimeoutSeconds: number;
  /** Scheme-specific additional data (preserved from upstream) */
  extra: Record<string, unknown>;
}

/**
 * V2 normalized receipt (preserves all upstream semantics).
 *
 * The upstream SettlementResponse does not carry resourceUrl or issuedAt;
 * those must be supplied by the caller from request context.
 */
export interface NormalizedV2Receipt {
  /** Protocol version (always 2) */
  version: 2;
  /** CAIP-2 network identifier */
  network: string;
  /** Payer address */
  payer: string;
  /** On-chain transaction hash (present on success) */
  transaction?: string;
  /** Resource URL (caller-supplied from request context) */
  resourceUrl: string;
  /** Receipt issuance timestamp in epoch seconds (caller-supplied from response timing) */
  issuedAt: number;
}

// ---------------------------------------------------------------------------
// V2 Offer Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a V2 PaymentRequired accept entry into a NormalizedV2Offer.
 *
 * V2 offers are per-accept-entry (each entry in accepts[] is one offer).
 * All upstream fields are preserved, including maxTimeoutSeconds and extra.
 *
 * @param accept - A single accept entry from PaymentRequired.accepts[]
 * @param resource - The PaymentRequired resource descriptor
 * @returns Normalized V2 offer with all upstream semantics preserved
 */
export function normalizeV2Offer(
  accept: RawV2PaymentRequiredAccept,
  resource: RawV2Resource
): NormalizedV2Offer {
  return {
    version: 2,
    resource,
    scheme: accept.scheme,
    network: accept.network,
    asset: accept.asset,
    payTo: accept.payTo,
    amount: accept.amount,
    maxTimeoutSeconds: accept.maxTimeoutSeconds,
    extra: accept.extra,
  };
}

/**
 * Normalize all offers from a V2 PaymentRequired challenge.
 *
 * @param challenge - The full V2 PaymentRequired object
 * @returns Array of normalized V2 offers (one per accept entry)
 */
export function normalizeV2Offers(challenge: RawV2PaymentRequired): NormalizedV2Offer[] {
  return challenge.accepts.map((accept) => normalizeV2Offer(accept, challenge.resource));
}

// ---------------------------------------------------------------------------
// V2 Receipt Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a V2 SettlementResponse into a NormalizedV2Receipt.
 *
 * Only successful settlements produce meaningful receipt payloads.
 * Failed settlements should be handled as errors, not receipts.
 *
 * The upstream SettlementResponse does not carry resourceUrl or issuedAt;
 * callers must supply these from request context and response timing.
 *
 * @param settlement - The V2 SettlementResponse (success or failure)
 * @param resourceUrl - Resource URL from the original request context
 * @param issuedAt - Receipt issuance timestamp (epoch seconds, from response timing)
 * @returns Normalized V2 receipt, or null if settlement failed
 */
export function normalizeV2Receipt(
  settlement: RawV2SettlementResponse,
  resourceUrl: string,
  issuedAt: number
): NormalizedV2Receipt | null {
  if (!settlement.success) {
    return null;
  }

  return {
    version: 2,
    network: settlement.network,
    payer: settlement.payer,
    resourceUrl,
    issuedAt,
    ...(settlement.transaction && { transaction: settlement.transaction }),
  };
}
