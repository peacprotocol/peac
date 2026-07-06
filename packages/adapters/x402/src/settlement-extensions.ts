/**
 * x402 settlement-extensions receipt extraction (Layer C convenience)
 *
 * Upstream x402's "Signed Offers & Receipts" extension places a signed
 * receipt on the settlement/200 response at
 * `extensions["offer-receipt"].info.receipt`
 * (x402-foundation/x402 commit f2bbb5c,
 * specs/extensions/extension-offer-and-receipt.md Section 5.1). This
 * placement is identical for x402 v1 (`X402SettlementResponse.extensions`)
 * and v2 (`NormalizedV2Receipt.extensions`, mirroring upstream
 * `SettleResponse.extensions?: Record<string, unknown>` from
 * `typescript/packages/core/src/types/facilitator.ts`).
 *
 * `extractSignedReceiptFromSettlement` narrows a settlement-shaped object
 * down to the embedded signed receipt artifact, if present. It reuses
 * `extractExtensionInfo` (raw.ts) for the documented challenge-side shape
 * where `offers` is present (e.g. an empty array). A settlement response
 * may also carry `extensions["offer-receipt"].info.receipt` with no
 * `offers` key at all: there is nothing left to offer once payment has
 * settled. `extractExtensionInfo` requires `offers` to be an array
 * (challenge-side contract) and returns `null` when it is absent, so that
 * settlement-only shape is narrowed to `.receipt` independently below.
 * Structural validation (object-shape checks at each nesting level, and
 * the signed-receipt envelope discriminant) is performed directly in this
 * module so malformed input can fail closed with `settlement_extensions_invalid`;
 * `extractExtensionInfo` returns `null` for any anomaly instead of
 * throwing, which is the right default for its own challenge-side callers
 * but not strict enough for this extraction path.
 *
 * This is extraction only: it does NOT verify the receipt's signature.
 * Callers must verify the returned artifact with the appropriate
 * x402/JWS/EIP-712 verifier.
 */

import { X402Error } from './errors.js';
import { OFFER_RECEIPT, extractExtensionInfo, parseCompactJWS } from './raw.js';
import type {
  RawSignedReceipt,
  RawJWSSignedReceipt,
  RawEIP712SignedReceipt,
  RawX402ExtensionInfo,
} from './raw.js';

/**
 * Maximum bytes for the RFC 8785 (JCS) canonical serialization of a
 * settlement `extensions` bag. Enforced by the mapper (`map.ts`) before
 * digesting or preserving the raw bag (DoS bound); exported so callers
 * share a single constant.
 */
export const MAX_SETTLEMENT_EXTENSIONS_BYTES = 256 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate and narrow a raw `info.receipt` value to the `RawSignedReceipt`
 * discriminated union (`RawJWSSignedReceipt | RawEIP712SignedReceipt`).
 * Enforces the compact-JWS byte bound on the JWS branch via
 * `parseCompactJWS` (the parsed result is discarded; only the raw compact
 * JWS string is preserved, matching the challenge-side extraction
 * discipline in raw.ts).
 */
function asSignedReceiptEnvelope(value: Record<string, unknown>): RawSignedReceipt {
  const format = value.format;

  if (format === 'jws') {
    const signature = value.signature;
    if (typeof signature !== 'string') {
      throw new X402Error(
        'settlement_extensions_invalid',
        'Settlement offer-receipt JWS receipt is missing a signature string'
      );
    }
    // Enforce the same compact-JWS byte bound as the challenge-side path.
    // Throws jws_too_large / jws_malformed / jws_padded_base64url /
    // jws_payload_not_object as appropriate; those codes propagate as-is.
    parseCompactJWS(signature);
    const receipt: RawJWSSignedReceipt = { format: 'jws', signature };
    return receipt;
  }

  if (format === 'eip712') {
    const signature = value.signature;
    const payload = value.payload;
    if (typeof signature !== 'string' || !isPlainObject(payload)) {
      throw new X402Error(
        'settlement_extensions_invalid',
        'Settlement offer-receipt EIP-712 receipt is missing payload/signature'
      );
    }
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: payload as unknown as RawEIP712SignedReceipt['payload'],
      signature,
    };
    return receipt;
  }

  throw new X402Error(
    'settlement_extensions_invalid',
    `Settlement offer-receipt receipt has an unrecognized format: ${JSON.stringify(format)}`
  );
}

/**
 * Extracts a signed receipt artifact from an x402 settlement response.
 * This helper does not verify the receipt signature; callers must verify
 * the returned artifact with the appropriate x402/JWS/EIP-712 verifier.
 */
export function extractSignedReceiptFromSettlement(settlement: unknown): RawSignedReceipt | null {
  if (!isPlainObject(settlement)) {
    return null;
  }

  const extensions = settlement.extensions;
  if (extensions === undefined) {
    return null;
  }
  if (!isPlainObject(extensions)) {
    throw new X402Error(
      'settlement_extensions_invalid',
      'settlement.extensions must be a JSON object'
    );
  }

  const offerReceipt = extensions[OFFER_RECEIPT];
  if (offerReceipt === undefined) {
    return null;
  }
  if (!isPlainObject(offerReceipt)) {
    throw new X402Error(
      'settlement_extensions_invalid',
      `settlement.extensions["${OFFER_RECEIPT}"] must be a JSON object`
    );
  }

  const info = offerReceipt.info;
  if (!isPlainObject(info)) {
    throw new X402Error(
      'settlement_extensions_invalid',
      `settlement.extensions["${OFFER_RECEIPT}"].info must be a JSON object`
    );
  }

  // Reuse the shared upstream nesting walk for the documented shape where
  // `offers` is present (e.g. an empty array, matching the challenge-side
  // contract). Fall back to an independent narrow-to-`.receipt` when
  // `offers` is absent entirely (a settlement-only shape).
  const extracted: RawX402ExtensionInfo | null = extractExtensionInfo(settlement);
  const rawReceipt = extracted?.receipt ?? info.receipt;

  if (rawReceipt === undefined) {
    return null;
  }
  if (!isPlainObject(rawReceipt)) {
    throw new X402Error(
      'settlement_extensions_invalid',
      `settlement.extensions["${OFFER_RECEIPT}"].info.receipt must be a JSON object`
    );
  }

  // The x402 offer-receipt extension places receipts on settlement
  // success (Section 5.1). A `success:false` settlement embedding a
  // receipt fails closed instead of being silently preserved.
  if (settlement.success === false) {
    throw new X402Error(
      'settlement_extensions_invalid',
      'Settlement extensions embed a receipt on a failed (success:false) settlement'
    );
  }

  return asSignedReceiptEnvelope(rawReceipt);
}
