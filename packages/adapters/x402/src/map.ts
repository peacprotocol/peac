/**
 * x402 to PEAC record mapping (Layer C)
 *
 * Maps x402 offer/receipt extension data into a canonical
 * PEAC interaction record (X402PeacRecord).
 *
 * Uses normalized payloads (Layer B output) for evidence fields.
 * Raw upstream artifacts are preserved as-is in proofs.
 */

import { createHash } from 'node:crypto';

import type { PeacEvidenceCarrier } from '@peac/kernel';
import { HASH } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import { canonicalize } from '@peac/crypto';

import { X402Error } from './errors.js';
import type { RawSignedOffer, RawSignedReceipt } from './raw.js';
import { extractOfferPayload, extractReceiptPayload } from './raw.js';
import { normalizeOfferPayload, normalizeReceiptPayload } from './normalize.js';
import type { NormalizedV2Offer, NormalizedV2Receipt } from './normalize-v2.js';
import {
  extractSignedReceiptFromSettlement,
  MAX_SETTLEMENT_EXTENSIONS_BYTES,
} from './settlement-extensions.js';
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

// ---------------------------------------------------------------------------
// Settlement extensions (proofs.x402), shared by V1 and V2 mapping
// ---------------------------------------------------------------------------

/**
 * Canonicalize a settlement `extensions` object for bounding + digesting,
 * converting any canonicalization failure into the stable adapter-local
 * `settlement_extensions_invalid` error. A public JS caller could pass a
 * value that is not JSON-canonicalizable (cyclic references, `BigInt`, or
 * other non-JSON types); those must fail closed with a stable protocol
 * code rather than leaking a raw `TypeError`/`RangeError`. The raw
 * extension value is never included in the error message.
 *
 * Note: `undefined` object-member values are omitted by `canonicalize`
 * (RFC 8785 / `JSON.stringify` semantics), not treated as an error.
 */
function canonicalizeSettlementExtensions(extensions: Record<string, unknown>): string {
  try {
    return canonicalize(extensions);
  } catch {
    throw new X402Error(
      'settlement_extensions_invalid',
      'Settlement extensions must be JSON-canonicalizable'
    );
  }
}

/**
 * Applies settlement `extensions` (x402 protocol-extension passthrough
 * data) to a PEAC record's `proofs.x402` bundle, in place.
 *
 * Privacy-hardened default: only a stable content digest
 * (`settlementExtensionsDigest`) is added, computed over the RFC 8785 JCS
 * canonicalization of `extensions`. The SAME canonical bytes are used for
 * both the DoS bound and the digest (computed once), avoiding a
 * bound/digest mismatch. The digest is byte-identical to
 * `computeJsonDocumentDigestJcs(extensions)` from `@peac/protocol`; it is
 * computed here via Node's synchronous `createHash` instead so that
 * `toPeacRecord`/`toPeacRecordV2` remain synchronous public APIs.
 *
 * Raw `extensions` are preserved under `proofs.x402.settlementExtensions`
 * ONLY when `preserveRaw` is true, and the preserved object is derived
 * from the already-bounded canonical string (`JSON.parse(canonical)`),
 * never the caller's live object reference, so later caller-side
 * mutation of the input cannot alter the emitted record.
 *
 * Also enforces a receipt-consistency guard: if `extensions` embeds a
 * signed receipt via the offer-receipt extension
 * (`extensions["offer-receipt"].info.receipt`) that structurally differs
 * from the receipt already present at `proofsX402.receipt`, the record
 * would carry two conflicting receipts, so mapping fails closed instead.
 *
 * No-op (byte-identical output) when `extensions` is `undefined`.
 *
 * @throws X402Error `settlement_extensions_too_large` if the canonical
 *   serialization exceeds `MAX_SETTLEMENT_EXTENSIONS_BYTES`.
 * @throws X402Error `settlement_extensions_invalid` if `extensions`
 *   embeds a receipt that conflicts with `proofsX402.receipt`, if the
 *   embedded offer-receipt extension is structurally malformed, or if
 *   `extensions` is not JSON-canonicalizable.
 */
function applySettlementExtensions(
  proofsX402: X402PeacRecord['proofs']['x402'],
  extensions: Record<string, unknown> | undefined,
  preserveRaw: boolean
): void {
  if (extensions === undefined) {
    return;
  }

  const canonical = canonicalizeSettlementExtensions(extensions);
  const byteLength = Buffer.byteLength(canonical, 'utf8');
  if (byteLength > MAX_SETTLEMENT_EXTENSIONS_BYTES) {
    throw new X402Error(
      'settlement_extensions_too_large',
      `Settlement extensions canonical serialization (${byteLength} bytes) exceeds the ${MAX_SETTLEMENT_EXTENSIONS_BYTES} byte limit`
    );
  }

  // Enforce receipt consistency using the same extraction path exposed
  // to callers, so the offer-receipt nesting walk has one source of truth.
  const embeddedReceipt = extractSignedReceiptFromSettlement({ extensions });
  if (
    embeddedReceipt !== null &&
    canonicalize(embeddedReceipt) !== canonicalize(proofsX402.receipt)
  ) {
    throw new X402Error(
      'settlement_extensions_invalid',
      'Settlement extensions embed a receipt that conflicts with proofs.x402.receipt'
    );
  }

  const digestHex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  proofsX402.settlementExtensionsDigest = `${HASH.prefix}${digestHex}`;

  if (preserveRaw) {
    // Derive the preserved object from the bounded canonical bytes,
    // never the caller's live object reference.
    proofsX402.settlementExtensions = JSON.parse(canonical) as Record<string, unknown>;
  }
}

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
  /**
   * Preserve the raw settlement `extensions` bag as a canonical JSON
   * clone under `proofs.x402.settlementExtensions`, in addition to the always-on
   * `settlementExtensionsDigest`. Default: false.
   *
   * Privacy note: the settlement `extensions` bag is upstream
   * protocol-extension data (e.g. batch-settlement, or sibling
   * extensions this adapter does not interpret) and MAY carry payer- or
   * resource-correlating material. The digest-by-default posture avoids
   * storing that raw material in the emitted PEAC record unless
   * explicitly opted in. The preserved value is a clone derived from the
   * bounded canonical (RFC 8785 JCS) bytes, never the caller's live
   * object reference.
   */
  preserveRawSettlementExtensions?: boolean;
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

  const proofsX402: X402PeacRecord['proofs']['x402'] = {
    offer, // exact raw artifact, never mutated
    receipt, // exact raw artifact, never mutated
  };
  applySettlementExtensions(
    proofsX402,
    settlementResponse.extensions,
    options?.preserveRawSettlementExtensions ?? false
  );

  return {
    version: X402_OFFER_RECEIPT_PROFILE,
    proofs: {
      x402: proofsX402,
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
// V2 record mapping
// ---------------------------------------------------------------------------

/**
 * Options for V2 record mapping
 */
export interface ToPeacRecordV2Options {
  /** Offer verification result */
  offerVerification?: OfferVerification;
  /** Consistency verification result */
  consistencyVerification?: ConsistencyVerification;
  /** Whether cryptographic verification was performed */
  cryptoVerified?: boolean;
  /** Crypto verification result */
  cryptoResult?: CryptoResult;
  /** Signer authorization result */
  authorizationResult?: AuthorizationResult;
  /**
   * Preserve the raw settlement `extensions` bag as a canonical JSON
   * clone under `proofs.x402.settlementExtensions`, in addition to the always-on
   * `settlementExtensionsDigest`. Default: false. See
   * `ToPeacRecordOptions.preserveRawSettlementExtensions` for the
   * privacy rationale (identical semantics for V2).
   */
  preserveRawSettlementExtensions?: boolean;
}

/**
 * Map V2 x402 payment flow to a PEAC interaction record.
 *
 * V2 uses per-accept-entry offers with different semantics:
 * maxTimeoutSeconds (duration) instead of validUntil (epoch),
 * resource metadata, and scheme-specific extra data.
 *
 * @param offer - Normalized V2 offer (single accept entry)
 * @param receipt - Normalized V2 receipt (caller supplies resourceUrl and issuedAt)
 * @param rawOffer - Raw upstream offer artifact (preserved in proofs)
 * @param rawReceipt - Raw upstream receipt artifact (preserved in proofs)
 * @param options - Optional verification results for hints
 * @returns Canonical PEAC interaction record
 */
export function toPeacRecordV2(
  offer: NormalizedV2Offer,
  receipt: NormalizedV2Receipt,
  rawOffer: RawSignedOffer,
  rawReceipt: RawSignedReceipt,
  options?: ToPeacRecordV2Options
): X402PeacRecord {
  const hints: X402PeacRecord['hints'] = {};

  if (receipt.resourceUrl) {
    hints.resourceUrl = receipt.resourceUrl;
  }

  // Build verification status
  const offerVerification = options?.offerVerification;
  const cryptoResult = options?.cryptoResult;
  const authResult = options?.authorizationResult;

  const verification: VerificationStatus = {
    structural: true,
    cryptographic: {
      verified: options?.cryptoVerified ?? false,
      ...(!(options?.cryptoVerified ?? false) && { reason: 'not_checked' }),
      format: rawOffer.format,
      ...(cryptoResult?.signer && { signer: cryptoResult.signer }),
    },
    termMatching: {
      matched: offerVerification?.valid ?? false,
      method: offerVerification?.usedHint ? 'hint' : 'scan',
      ...(offerVerification?.matchedIndex !== undefined && {
        matchedIndex: offerVerification.matchedIndex,
      }),
      ...(!offerVerification && { reason: 'not_verified' }),
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

  const proofsX402: X402PeacRecord['proofs']['x402'] = {
    offer: rawOffer,
    receipt: rawReceipt,
  };
  applySettlementExtensions(
    proofsX402,
    receipt.extensions,
    options?.preserveRawSettlementExtensions ?? false
  );

  return {
    version: X402_OFFER_RECEIPT_PROFILE,
    proofs: {
      x402: proofsX402,
    },
    evidence: {
      resourceUrl: offer.resource.url,
      network: offer.network,
      payee: offer.payTo,
      asset: offer.asset,
      amount: offer.amount,
      offerVersion: offer.version,
      maxTimeoutSeconds: offer.maxTimeoutSeconds,
      scheme: offer.scheme,
      ...(receipt.payer && { payer: receipt.payer }),
      ...(receipt.issuedAt && { issuedAt: receipt.issuedAt }),
      ...(receipt.transaction && { transaction: receipt.transaction }),
      receiptVersion: receipt.version,
    },
    hints,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Evidence Carrier mapping
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
