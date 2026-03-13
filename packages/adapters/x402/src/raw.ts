/**
 * x402 raw wire types and extraction (Layer A)
 *
 * Exact mirror of upstream coinbase/x402 TypeScript types and field shapes
 * after PR #935 (Offer/Receipt Extension) merged at commit f2bbb5c.
 *
 * This layer exists to:
 * 1. Match upstream encoded wire shapes exactly (no renames, no approximations)
 * 2. Provide extraction helpers for both JWS and EIP-712 formats
 * 3. Serve as the single source of truth for wire-level types
 *
 * Upstream TypeScript keeps `validUntil` and `transaction` as always-present
 * fields because EIP-712 requires fixed schemas. Unused values are encoded as
 * `0` (validUntil) and `""` (transaction). This layer preserves that encoding;
 * semantic normalization to `undefined` happens in Layer B (normalize.ts).
 *
 * IMPORTANT: Types in this file MUST match upstream exactly.
 * Do NOT rename fields, add PEAC-specific fields, or change types.
 */

import { base64urlDecodeString } from '@peac/crypto';

import { X402Error } from './errors.js';

// ---------------------------------------------------------------------------
// Upstream Extension Constant
// ---------------------------------------------------------------------------

/**
 * Upstream extension key for offer/receipt extension
 *
 * Matches upstream `OFFER_RECEIPT = "offer-receipt"`.
 * Used in `extensions["offer-receipt"].info`.
 */
export const OFFER_RECEIPT = 'offer-receipt' as const;

// ---------------------------------------------------------------------------
// Offer Payload (Layer A2: exact typed-data payload contract)
// ---------------------------------------------------------------------------

/**
 * Exact upstream x402 offer payload (encoded, Layer A2)
 *
 * Field names and types match coinbase/x402 PR #935 TS interface exactly.
 * All fields are always present in the encoded payload.
 * EIP-712 uses `0` for unused `validUntil` (encoding placeholder, not semantic absence).
 * Conversion to semantic optionality happens exclusively in Layer B (normalize.ts).
 */
export interface RawOfferPayload {
  /** Schema version (upstream: number, not string) */
  version: number;
  /** Resource URL the offer is for (required per upstream) */
  resourceUrl: string;
  /** Settlement scheme (required per upstream) */
  scheme: string;
  /** CAIP-2 network identifier (e.g., "eip155:8453") */
  network: string;
  /** Payment asset identifier (e.g., "USDC") */
  asset: string;
  /** Payment recipient address */
  payTo: string;
  /** Payment amount in minor units */
  amount: string;
  /**
   * Offer expiry as epoch seconds
   *
   * Always present in the encoded payload per upstream TS interface.
   * EIP-712 encodes unused values as `0` (fixed schema requirement).
   * Layer B (normalize.ts) converts `0` to `undefined` (semantic absence).
   */
  validUntil: number;
}

// ---------------------------------------------------------------------------
// Receipt Payload (Layer A2: exact typed-data payload contract)
// ---------------------------------------------------------------------------

/**
 * Exact upstream x402 receipt payload (encoded, Layer A2)
 *
 * Field names and types match coinbase/x402 PR #935 TS interface exactly.
 * All fields are always present in the encoded payload.
 * EIP-712 uses `""` for unused `transaction` (encoding placeholder, not semantic absence).
 * Conversion to semantic optionality happens exclusively in Layer B (normalize.ts).
 *
 * Privacy-minimal by design: receipts carry service-delivery proof, not payment details.
 */
export interface RawReceiptPayload {
  /** Schema version (upstream: number) */
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
   * Always present in the encoded payload per upstream TS interface.
   * EIP-712 encodes unused values as `""` (fixed schema requirement).
   * Layer B (normalize.ts) converts `""` to `undefined` (semantic absence).
   */
  transaction: string;
}

// ---------------------------------------------------------------------------
// Discriminated Signed Artifact Unions
// ---------------------------------------------------------------------------

/**
 * JWS-signed offer (compact serialization)
 *
 * For JWS format, the payload is encoded inside the compact JWS string.
 * There is no separate `payload` field. The `signature` field contains
 * the full compact JWS (header.payload.signature).
 */
export interface RawJWSSignedOffer {
  format: 'jws';
  /** Compact JWS containing the offer payload (header.payload.signature) */
  signature: string;
  /** Index into accepts[] that this offer targets (per-offer, not top-level) */
  acceptIndex?: number;
}

/**
 * EIP-712 signed offer
 *
 * For EIP-712 format, the payload is a separate field alongside
 * the hex-encoded ECDSA signature.
 */
export interface RawEIP712SignedOffer {
  format: 'eip712';
  /** The signed offer payload */
  payload: RawOfferPayload;
  /** Hex-encoded ECDSA signature */
  signature: string;
  /** Index into accepts[] that this offer targets (per-offer, not top-level) */
  acceptIndex?: number;
}

/** Discriminated union of signed offer formats */
export type RawSignedOffer = RawJWSSignedOffer | RawEIP712SignedOffer;

/**
 * JWS-signed receipt (compact serialization)
 *
 * Same pattern as JWS offers: payload is inside the compact JWS string.
 */
export interface RawJWSSignedReceipt {
  format: 'jws';
  /** Compact JWS containing the receipt payload */
  signature: string;
}

/**
 * EIP-712 signed receipt
 */
export interface RawEIP712SignedReceipt {
  format: 'eip712';
  /** The signed receipt payload */
  payload: RawReceiptPayload;
  /** Hex-encoded ECDSA signature */
  signature: string;
}

/** Discriminated union of signed receipt formats */
export type RawSignedReceipt = RawJWSSignedReceipt | RawEIP712SignedReceipt;

// ---------------------------------------------------------------------------
// Extension Nesting (upstream structure)
// ---------------------------------------------------------------------------

/**
 * Upstream x402 extension info structure
 *
 * In upstream, the offer/receipt data lives under:
 * `extensions["offer-receipt"].info`
 */
export interface RawX402ExtensionInfo {
  /** Array of signed offers */
  offers: RawSignedOffer[];
  /** Optional signed receipt */
  receipt?: RawSignedReceipt;
}

// ---------------------------------------------------------------------------
// JWS Parsing Contract (Hardened)
// ---------------------------------------------------------------------------

/**
 * Default maximum compact JWS byte length (64 KB)
 *
 * Enforced BEFORE base64url decoding to prevent memory amplification.
 */
export const MAX_COMPACT_JWS_BYTES = 64 * 1024;

/**
 * Parsed compact JWS components
 *
 * The raw `compact` string is the signed artifact and MUST be preserved as-is.
 * These parsed components are for extraction only; never reconstruct from parts.
 */
export interface ParsedCompactJWS {
  /** Decoded JOSE header */
  header: Record<string, unknown>;
  /** Decoded payload (guaranteed to be a plain object) */
  payload: Record<string, unknown>;
  /** Raw signature segment (base64url-encoded) */
  signatureSegment: string;
}

/**
 * Parse a compact JWS string with hardened validation
 *
 * Contract:
 * 1. Exactly 3 segments (split on `.`)
 * 2. No padding characters (`=`) in any segment
 * 3. Size limit enforced BEFORE decoding
 * 4. Payload MUST be a plain JSON object (not array, primitive, or null)
 * 5. Never reconstruct: the compact JWS is the signed artifact
 * 6. Fail-closed on any anomaly
 *
 * @param compact - The compact JWS string
 * @param maxBytes - Maximum byte length (default: MAX_COMPACT_JWS_BYTES)
 * @returns Parsed components
 * @throws X402Error with specific error code on any parsing failure
 */
export function parseCompactJWS(
  compact: string,
  maxBytes: number = MAX_COMPACT_JWS_BYTES
): ParsedCompactJWS {
  // 1. Size limit before any processing
  if (compact.length > maxBytes) {
    throw new X402Error('jws_too_large', `Compact JWS exceeds ${maxBytes} byte limit`);
  }

  // 2. Split into exactly 3 segments
  const segments = compact.split('.');
  if (segments.length !== 3) {
    throw new X402Error(
      'jws_malformed',
      `Expected 3 segments in compact JWS, got ${segments.length}`
    );
  }

  // 3. Reject padded base64url (per RFC 7515, base64url has no padding)
  for (const seg of segments) {
    if (seg.includes('=')) {
      throw new X402Error(
        'jws_padded_base64url',
        'Padded base64url is not valid in compact JWS (RFC 7515)'
      );
    }
  }

  // 4. Decode header
  let header: unknown;
  try {
    const headerJson = base64urlDecodeString(segments[0]);
    header = JSON.parse(headerJson);
  } catch (e) {
    throw new X402Error(
      'jws_malformed',
      `Failed to decode JWS header: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new X402Error('jws_malformed', 'JWS header must be a JSON object');
  }

  // 5. Decode payload
  let payload: unknown;
  try {
    const payloadJson = base64urlDecodeString(segments[1]);
    payload = JSON.parse(payloadJson);
  } catch (e) {
    throw new X402Error(
      'jws_malformed',
      `Failed to decode JWS payload: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // 6. Payload must be a plain object (not array, primitive, or null)
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new X402Error('jws_payload_not_object', 'JWS payload must be a JSON object');
  }

  return {
    header: header as Record<string, unknown>,
    payload: payload as Record<string, unknown>,
    signatureSegment: segments[2],
  };
}

// ---------------------------------------------------------------------------
// Payload Extraction Helpers
// ---------------------------------------------------------------------------

/**
 * Extract offer payload from a signed offer
 *
 * For EIP-712: returns the `payload` field directly.
 * For JWS: decodes the compact JWS and returns the decoded payload.
 *
 * @param offer - The signed offer (discriminated union)
 * @param maxJwsBytes - Maximum JWS byte length for JWS format
 * @returns The raw offer payload
 * @throws X402Error if extraction fails
 */
export function extractOfferPayload(offer: RawSignedOffer, maxJwsBytes?: number): RawOfferPayload {
  if (offer.format === 'eip712') {
    return offer.payload;
  }

  // JWS format: decode from compact serialization
  const parsed = parseCompactJWS(offer.signature, maxJwsBytes);
  return parsed.payload as unknown as RawOfferPayload;
}

/**
 * Extract receipt payload from a signed receipt
 *
 * For EIP-712: returns the `payload` field directly.
 * For JWS: decodes the compact JWS and returns the decoded payload.
 *
 * @param receipt - The signed receipt (discriminated union)
 * @param maxJwsBytes - Maximum JWS byte length for JWS format
 * @returns The raw receipt payload
 * @throws X402Error if extraction fails
 */
export function extractReceiptPayload(
  receipt: RawSignedReceipt,
  maxJwsBytes?: number
): RawReceiptPayload {
  if (receipt.format === 'eip712') {
    return receipt.payload;
  }

  // JWS format: decode from compact serialization
  const parsed = parseCompactJWS(receipt.signature, maxJwsBytes);
  return parsed.payload as unknown as RawReceiptPayload;
}

/**
 * Extract x402 extension info from an upstream response body
 *
 * Equivalent to upstream's `extractOffersFromPaymentRequired()` but operates
 * on the raw response body rather than the upstream `PaymentRequired` type.
 * Looks for `extensions["offer-receipt"].info` in the body.
 *
 * This is the entry point for converting raw upstream wire data into
 * PEAC's `X402OfferReceiptChallenge` convenience type.
 *
 * @param body - The upstream response body (unknown shape)
 * @returns The extension info, or null if absent/malformed
 */
export function extractExtensionInfo(body: unknown): RawX402ExtensionInfo | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }

  const typed = body as Record<string, unknown>;
  const extensions = typed.extensions;
  if (typeof extensions !== 'object' || extensions === null || Array.isArray(extensions)) {
    return null;
  }

  const ext = extensions as Record<string, unknown>;
  const offerReceipt = ext['offer-receipt'];
  if (typeof offerReceipt !== 'object' || offerReceipt === null || Array.isArray(offerReceipt)) {
    return null;
  }

  const orTyped = offerReceipt as Record<string, unknown>;
  const info = orTyped.info;
  if (typeof info !== 'object' || info === null || Array.isArray(info)) {
    return null;
  }

  const infoTyped = info as Record<string, unknown>;

  // Validate offers is an array
  if (!Array.isArray(infoTyped.offers)) {
    return null;
  }

  return {
    offers: infoTyped.offers as RawSignedOffer[],
    ...(infoTyped.receipt !== undefined && {
      receipt: infoTyped.receipt as RawSignedReceipt,
    }),
  };
}

// ---------------------------------------------------------------------------
// Upstream Message Shape Extractors
// ---------------------------------------------------------------------------

/**
 * Standard x402 response header names for payment receipts
 *
 * Upstream uses `X-PAYMENT-RESPONSE` (primary) and `PAYMENT-RESPONSE` (alias).
 */
export const X402_RECEIPT_HEADERS = ['x-payment-response', 'payment-response'] as const;

/**
 * Extract signed receipt from x402 settlement response headers
 *
 * Equivalent to upstream's `extractReceiptFromResponse()` but operates
 * on raw headers rather than a `Response` object. Upstream sends the
 * signed receipt as JSON in `X-PAYMENT-RESPONSE` or `PAYMENT-RESPONSE`.
 *
 * @param headers - Response headers (case-insensitive lookup)
 * @returns The signed receipt, or null if absent/malformed
 */
export function extractReceiptFromHeaders(
  headers: Record<string, string | string[] | undefined>
): RawSignedReceipt | null {
  // Case-insensitive header lookup
  const lowerHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      lowerHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  let raw: string | undefined;
  for (const name of X402_RECEIPT_HEADERS) {
    raw = lowerHeaders[name];
    if (raw) break;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    if (parsed.format !== 'eip712' && parsed.format !== 'jws') return null;
    if (typeof parsed.signature !== 'string') return null;
    return parsed as RawSignedReceipt;
  } catch {
    return null;
  }
}
