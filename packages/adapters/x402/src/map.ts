/**
 * x402 to PEAC record mapping (Layer C)
 *
 * Maps x402 offer/receipt extension data into a canonical
 * PEAC interaction record (X402PeacRecord).
 *
 * Uses normalized payloads (Layer B output) for evidence fields.
 * Raw upstream artifacts are preserved as-is in proofs.
 */

import type { PeacEvidenceCarrier } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';

import { X402Error } from './errors.js';
import type { RawSignedOffer, RawSignedReceipt } from './raw.js';
import { extractOfferPayload, extractReceiptPayload } from './raw.js';
import { normalizeOfferPayload, normalizeReceiptPayload } from './normalize.js';
import type {
  X402OfferReceiptChallenge,
  X402SettlementResponse,
  X402PeacRecord,
  VerificationStatus,
  OfferVerification,
  ConsistencyVerification,
  CryptoResult,
  AuthorizationResult,
} from './types.js';
import { X402_OFFER_RECEIPT_PROFILE } from './types.js';

/**
 * Options for record mapping
 */
export interface ToPeacRecordOptions {
  /**
   * Offer verification result (to populate verification hints)
   */
  offerVerification?: OfferVerification;
  /**
   * Consistency verification result
   */
  consistencyVerification?: ConsistencyVerification;
  /**
   * Whether cryptographic signature verification was performed
   * Default: false (adapter does NOT perform crypto verification)
   */
  cryptoVerified?: boolean;
  /**
   * Crypto verification result (if crypto verification was performed)
   */
  cryptoResult?: CryptoResult;
  /**
   * Signer authorization result (if authorization was performed)
   */
  authorizationResult?: AuthorizationResult;
  /**
   * Index of the offer within the offers array to use for mapping
   * Default: 0 (first offer)
   */
  offerIndex?: number;
  /**
   * Maximum compact JWS byte length for payload extraction
   */
  maxCompactJwsBytes?: number;
}

/**
 * Map x402 payment flow to a PEAC interaction record
 *
 * Takes a PaymentRequired (offer side) and SettlementResponse (receipt side)
 * and produces a canonical PEAC record with normalized evidence.
 *
 * Uses Layer B (normalized) payloads for evidence; stores exact raw
 * artifacts in proofs (proof preservation discipline).
 *
 * @param paymentRequired - The 402 response with offers and accepts
 * @param settlementResponse - The settlement response with receipt
 * @param options - Optional mapping options
 * @returns Canonical PEAC interaction record
 * @throws X402Error if inputs are structurally invalid
 */
export function toPeacRecord(
  paymentRequired: X402OfferReceiptChallenge,
  settlementResponse: X402SettlementResponse,
  options?: ToPeacRecordOptions
): X402PeacRecord {
  const offerIndex = options?.offerIndex ?? 0;
  const maxJwsBytes = options?.maxCompactJwsBytes;

  // Validate offers array
  if (
    !paymentRequired.offers ||
    !Array.isArray(paymentRequired.offers) ||
    paymentRequired.offers.length === 0
  ) {
    throw new X402Error(
      'offer_invalid_format',
      'PaymentRequired must contain a non-empty offers array'
    );
  }

  if (offerIndex < 0 || offerIndex >= paymentRequired.offers.length) {
    throw new X402Error(
      'offer_invalid_format',
      `offerIndex ${offerIndex} is out of range [0, ${paymentRequired.offers.length - 1}]`
    );
  }

  const offer: RawSignedOffer = paymentRequired.offers[offerIndex];
  const receipt: RawSignedReceipt = settlementResponse.receipt;

  if (!receipt) {
    throw new X402Error(
      'receipt_invalid_format',
      'SettlementResponse must contain a valid receipt'
    );
  }

  // Extract and normalize payloads (Layer A -> Layer B)
  const rawOfferPayload = extractOfferPayload(offer, maxJwsBytes);
  const rawReceiptPayload = extractReceiptPayload(receipt, maxJwsBytes);
  const offerPayload = normalizeOfferPayload(rawOfferPayload);
  const receiptPayload = normalizeReceiptPayload(rawReceiptPayload);

  // Build hints (unsigned metadata, explicitly untrusted)
  const hints: X402PeacRecord['hints'] = {};

  // Derive mismatchDetected from termMatching
  const termMatching = options?.offerVerification?.termMatching;
  const mismatchDetected = termMatching?.hintMismatchDetected ?? false;

  // acceptIndex is now per-offer
  if (offer.acceptIndex !== undefined) {
    hints.acceptIndex = {
      value: offer.acceptIndex,
      untrusted: true,
      ...(mismatchDetected && { mismatchDetected: true }),
    };
  }

  const resourceUrl = paymentRequired.resourceUrl ?? settlementResponse.resourceUrl;
  if (resourceUrl) {
    hints.resourceUrl = resourceUrl;
  }

  // Build verification status
  const offerVerification = options?.offerVerification;
  const termMatchingVerified = offerVerification !== undefined;
  const cryptoResult = options?.cryptoResult;
  const authResult = options?.authorizationResult;

  const verification: VerificationStatus = {
    structural: true,
    cryptographic: {
      verified: options?.cryptoVerified ?? false,
      ...(!(options?.cryptoVerified ?? false) && { reason: 'not_checked' }),
      format: offer.format,
      ...(cryptoResult?.signer && { signer: cryptoResult.signer }),
    },
    termMatching: {
      matched: termMatchingVerified ? offerVerification.valid : false,
      method: offerVerification?.usedHint ? 'hint' : 'scan',
      ...(offerVerification?.matchedIndex !== undefined && {
        matchedIndex: offerVerification.matchedIndex,
      }),
      ...(!termMatchingVerified && { reason: 'not_verified' }),
    },
    ...(options?.consistencyVerification && {
      consistency: {
        checked: true,
        valid: options.consistencyVerification.valid,
      },
    }),
    ...(authResult && {
      signerAuthorization: {
        checked: true,
        authorized: authResult.authorized,
        ...(authResult.method && { method: authResult.method }),
      },
    }),
  };

  hints.verification = verification;

  return {
    version: X402_OFFER_RECEIPT_PROFILE,
    proofs: {
      x402: {
        offer, // exact raw artifact, never mutated
        receipt, // exact raw artifact, never mutated
      },
    },
    evidence: {
      resourceUrl: offerPayload.resourceUrl,
      ...(offerPayload.validUntil !== undefined && { validUntil: offerPayload.validUntil }),
      network: offerPayload.network,
      payee: offerPayload.payTo,
      asset: offerPayload.asset,
      amount: offerPayload.amount,
      offerVersion: offerPayload.version,
      ...(receiptPayload.payer && { payer: receiptPayload.payer }),
      ...(receiptPayload.issuedAt && { issuedAt: receiptPayload.issuedAt }),
      ...(receiptPayload.transaction && { transaction: receiptPayload.transaction }),
      ...(receiptPayload.version !== undefined && { receiptVersion: receiptPayload.version }),
    },
    hints,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Evidence Carrier mapping (DD-124)
// ---------------------------------------------------------------------------

/**
 * Convert an x402 PEAC record to a PeacEvidenceCarrier.
 *
 * Uses the shared `computeReceiptRef()` from `@peac/schema`
 * to produce a canonical, content-addressed receipt_ref from the JWS.
 *
 * @param receiptJws - Compact JWS of the PEAC receipt
 * @returns PeacEvidenceCarrier with computed receipt_ref
 */
export async function toPeacCarrier(receiptJws: string): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(receiptJws);
  return {
    receipt_ref: ref,
    receipt_jws: receiptJws,
  };
}
