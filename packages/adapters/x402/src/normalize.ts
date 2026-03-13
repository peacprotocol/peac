/**
 * x402 semantic normalization (Layer B)
 *
 * Converts EIP-712 placeholder values into semantic absence.
 * This layer exists because EIP-712 requires fixed schemas, so unused
 * values are represented as `0` (for numbers) and `""` (for strings).
 *
 * Normalization rules:
 * - `validUntil === 0` -> `undefined` (EIP-712 "no expiry" placeholder)
 * - `transaction === ""` -> `undefined` (EIP-712 "no transaction" placeholder)
 * - All other fields pass through unchanged
 *
 * IMPORTANT: Raw artifacts are NEVER mutated. Normalization produces
 * new objects; the originals are preserved in proofs.
 */

import type { RawOfferPayload, RawReceiptPayload } from './raw.js';

// ---------------------------------------------------------------------------
// Normalized Types (Layer B output)
// ---------------------------------------------------------------------------

/**
 * Normalized offer payload (semantically clean)
 *
 * Same fields as RawOfferPayload, but with EIP-712 placeholders
 * converted to semantic absence (`undefined`).
 */
export interface NormalizedOfferPayload {
  /** Schema version */
  version: number;
  /** Resource URL the offer is for */
  resourceUrl: string;
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
   * Offer expiry as epoch seconds
   *
   * `undefined` means "no expiry" (was `0` in EIP-712 encoding, or absent).
   * Verification layer enforces expiry policy separately.
   */
  validUntil?: number;
}

/**
 * Normalized receipt payload (semantically clean)
 *
 * Same fields as RawReceiptPayload, but with EIP-712 placeholders
 * converted to semantic absence (`undefined`).
 */
export interface NormalizedReceiptPayload {
  /** Schema version */
  version: number;
  /** CAIP-2 network identifier */
  network: string;
  /** Resource URL the receipt is for */
  resourceUrl: string;
  /** Payer address */
  payer: string;
  /** Receipt issuance timestamp (epoch seconds) */
  issuedAt: number;
  /**
   * On-chain transaction reference
   *
   * `undefined` means "no transaction reference" (was `""` in EIP-712, or absent).
   * Privacy-minimal: transaction is optional enrichable evidence, not receipt identity.
   */
  transaction?: string;
}

// ---------------------------------------------------------------------------
// Normalization Functions
// ---------------------------------------------------------------------------

/**
 * Normalize an offer payload from raw wire to semantic representation
 *
 * Applies EIP-712 placeholder rules:
 * - `validUntil === 0` -> `undefined` (no expiry)
 *
 * `validUntil` is always present in the raw payload (required per upstream TS).
 * All other fields pass through unchanged.
 *
 * @param raw - The raw offer payload (Layer A2)
 * @returns Normalized offer payload (Layer B)
 */
export function normalizeOfferPayload(raw: RawOfferPayload): NormalizedOfferPayload {
  return {
    version: raw.version,
    resourceUrl: raw.resourceUrl,
    scheme: raw.scheme,
    network: raw.network,
    asset: raw.asset,
    payTo: raw.payTo,
    amount: raw.amount,
    // EIP-712 placeholder: 0 means "no expiry"
    ...(raw.validUntil !== 0 && {
      validUntil: raw.validUntil,
    }),
  };
}

/**
 * Normalize a receipt payload from raw wire to semantic representation
 *
 * Applies EIP-712 placeholder rules:
 * - `transaction === ""` -> `undefined` (no transaction)
 *
 * `transaction` is always present in the raw payload (required per upstream TS).
 * All other fields pass through unchanged.
 *
 * @param raw - The raw receipt payload (Layer A2)
 * @returns Normalized receipt payload (Layer B)
 */
export function normalizeReceiptPayload(raw: RawReceiptPayload): NormalizedReceiptPayload {
  return {
    version: raw.version,
    network: raw.network,
    resourceUrl: raw.resourceUrl,
    payer: raw.payer,
    issuedAt: raw.issuedAt,
    // EIP-712 placeholder: "" means "no transaction"
    ...(raw.transaction !== '' && {
      transaction: raw.transaction,
    }),
  };
}
