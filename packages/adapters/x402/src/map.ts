/**
 * x402 to PEAC record mapping
 *
 * Maps x402 PaymentRequired + SettlementResponse into a canonical
 * PEAC interaction record (X402PeacRecord).
 *
 * NOTE: This mapper produces records for the x402 Offer/Receipt EXTENSION,
 * NOT the baseline x402 header flow. The profile identifier reflects this.
 *
 * The record preserves:
 * - Raw proofs (offer + receipt) for audit/dispute
 * - Normalized evidence fields from signed payloads
 * - Unsigned hints (acceptIndex) explicitly marked as untrusted
 * - Verification status metadata (structural, cryptographic, termMatching)
 */

import { X402Error } from './errors.js';
import type {
  X402PaymentRequired,
  X402SettlementResponse,
  X402PeacRecord,
  VerificationStatus,
  OfferVerification,
} from './types.js';
import { X402_OFFER_RECEIPT_PROFILE } from './types.js';

/**
 * Options for record mapping
 */
export interface ToPeacRecordOptions {
  /**
   * Offer verification result (to populate verification hints)
   *
   * The termMatching field in OfferVerification is used to derive
   * hints.acceptIndex.mismatchDetected automatically. This makes
   * mismatch detection first-class without requiring external options.
   */
  offerVerification?: OfferVerification;
  /**
   * Whether cryptographic signature verification was performed
   * Default: false (adapter does NOT perform crypto verification)
   */
  cryptoVerified?: boolean;
  /**
   * Signer identity (if crypto verification was performed)
   */
  cryptoSigner?: string;
}

/**
 * Map x402 payment flow to a PEAC interaction record
 *
 * Takes a PaymentRequired (offer side) and SettlementResponse (receipt side)
 * and produces a canonical PEAC record with normalized evidence.
 *
 * IMPORTANT: The resulting record does NOT indicate cryptographic signature
 * validity unless you explicitly pass `cryptoVerified: true` in options.
 * See `hints.verification.cryptographic` in the output.
 *
 * @param paymentRequired - The 402 response with offer and accepts
 * @param settlementResponse - The settlement response with receipt
 * @param options - Optional mapping options
 * @returns Canonical PEAC interaction record
 * @throws X402Error if inputs are structurally invalid
 */
export function toPeacRecord(
  paymentRequired: X402PaymentRequired,
  settlementResponse: X402SettlementResponse,
  options?: ToPeacRecordOptions
): X402PeacRecord {
  const offer = paymentRequired.offer;
  const receipt = settlementResponse.receipt;

  if (!offer?.payload) {
    throw new X402Error(
      'offer_invalid_format',
      'PaymentRequired must contain a valid offer with payload'
    );
  }
  if (!receipt?.payload) {
    throw new X402Error(
      'receipt_invalid_format',
      'SettlementResponse must contain a valid receipt with payload'
    );
  }

  const offerPayload = offer.payload;
  const receiptPayload = receipt.payload;

  // Build hints (unsigned metadata, explicitly untrusted)
  const hints: X402PeacRecord['hints'] = {};

  // Derive mismatchDetected from termMatching (first-class, always boolean when present)
  const termMatching = options?.offerVerification?.termMatching;
  const mismatchDetected = termMatching?.hintMismatchDetected ?? false;

  if (paymentRequired.acceptIndex !== undefined) {
    hints.acceptIndex = {
      value: paymentRequired.acceptIndex,
      untrusted: true,
      ...(mismatchDetected && { mismatchDetected: true }),
    };
  }

  const resourceUrl = paymentRequired.resourceUrl ?? settlementResponse.resourceUrl;
  if (resourceUrl) {
    hints.resourceUrl = resourceUrl;
  }

  // Build verification status
  // IMPORTANT: If offerVerification is not provided, we cannot assume terms matched.
  // Callers SHOULD provide offerVerification for a complete record.
  const offerVerification = options?.offerVerification;
  const termMatchingVerified = offerVerification !== undefined;

  const verification: VerificationStatus = {
    structural: true,
    cryptographic: {
      verified: options?.cryptoVerified ?? false,
      ...(!(options?.cryptoVerified ?? false) && { reason: 'not_checked' }),
      format: offer.format,
      ...(options?.cryptoSigner && { signer: options.cryptoSigner }),
    },
    termMatching: {
      // Safe-by-default: if verification wasn't performed, indicate that clearly
      matched: termMatchingVerified ? offerVerification.valid : false,
      method: offerVerification?.usedHint ? 'hint' : 'scan',
      ...(offerVerification?.matchedIndex !== undefined && {
        matchedIndex: offerVerification.matchedIndex,
      }),
      // Add flag to indicate if term-matching was actually performed
      ...(!termMatchingVerified && { reason: 'not_verified' }),
    },
  };

  hints.verification = verification;

  return {
    version: X402_OFFER_RECEIPT_PROFILE,
    proofs: {
      x402: {
        offer,
        receipt,
      },
    },
    evidence: {
      validUntil: offerPayload.validUntil,
      network: offerPayload.network,
      payee: offerPayload.payTo,
      asset: offerPayload.asset,
      amount: offerPayload.amount,
      txHash: receiptPayload.txHash,
      offerVersion: offerPayload.version,
      ...(receiptPayload.version && { receiptVersion: receiptPayload.version }),
    },
    hints,
    createdAt: new Date().toISOString(),
  };
}
