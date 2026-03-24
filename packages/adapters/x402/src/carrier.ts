/**
 * x402 carrier adapter for Evidence Carrier Contract.
 *
 * v0.11.1: header-only transport via PEAC-Receipt (compact JWS).
 * v0.12.4: dual-header read for x402 v1/v2 upstream receipt artifacts (DD-193).
 *
 * Extracts from x402 HTTP 402 (offer) and HTTP 200 (settlement) responses.
 * All size limits enforce the 8 KB header ceiling (x402_headers).
 * Reference mode is not supported; receipt_jws is required for attach.
 *
 * Receipt artifact extraction priority:
 *   1. PEAC-Receipt (PEAC carrier contract, always preferred)
 *   2. PAYMENT-RESPONSE (x402 v2 upstream response header)
 *   3. X-PAYMENT-RESPONSE (x402 v1 upstream response header)
 *
 * PAYMENT-REQUIRED is NOT handled here; it is payment-requirement/challenge
 * material, not a receipt artifact. A future extractChallengeArtifactFromHeaders()
 * seam may be added for challenge-side extraction if needed.
 */

import type {
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from '@peac/kernel';
import { PEAC_RECEIPT_HEADER, PEAC_RECEIPT_URL_HEADER } from '@peac/kernel';
import {
  computeReceiptRef,
  validateCarrierConstraints,
  CARRIER_TRANSPORT_LIMITS,
} from '@peac/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** x402 carrier size limits */
export const X402_CARRIER_LIMITS = {
  embed: CARRIER_TRANSPORT_LIMITS.x402_embed,
  headers: CARRIER_TRANSPORT_LIMITS.x402_headers,
} as const;

/**
 * x402 upstream receipt response header names (lowercase for case-insensitive matching).
 *
 * v2 uses PAYMENT-RESPONSE; v1 uses X-PAYMENT-RESPONSE.
 * Both carry the upstream receipt artifact (typically JSON with signed receipt data).
 * Priority: v2 first, then v1 fallback.
 */
const X402_V2_RECEIPT_HEADER = 'payment-response' as const;
const X402_V1_RECEIPT_HEADER = 'x-payment-response' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simple header map */
export type X402HeaderMap = Record<string, string>;

/** x402 HTTP response (402 or 200) with headers and body */
export interface X402ResponseLike {
  headers?: X402HeaderMap;
  body?: Record<string, unknown>;
}

/** Source of the extracted receipt artifact */
export type ReceiptArtifactSource = 'peac' | 'x402_v2' | 'x402_v1';

/** Artifact kind discriminant for receipt extraction */
export type ReceiptArtifactKind = 'receipt' | 'unknown';

/** Format hint for the extracted artifact */
export type ReceiptArtifactFormat = 'jws' | 'json' | 'unknown';

/** Result of extracting a receipt artifact from headers */
export interface ReceiptArtifactResult {
  source: ReceiptArtifactSource;
  headerName: string;
  rawArtifact: string;
  parsedForm?: unknown;
  artifactKind: ReceiptArtifactKind;
  /**
   * Format of the extracted artifact.
   * - 'jws': PEAC compact JWS receipt (from PEAC-Receipt header)
   * - 'json': upstream x402 response data (from PAYMENT-RESPONSE / X-PAYMENT-RESPONSE)
   * - 'unknown': could not determine format
   */
  artifactFormat: ReceiptArtifactFormat;
  /**
   * Whether this artifact is a PEAC signed receipt (true) or an upstream
   * observational artifact (false). Downstream callers should not treat
   * upstream x402 response data as PEAC receipts.
   */
  isPeacReceipt: boolean;
}

/** Extraction result */
export interface X402ExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
  /**
   * Raw upstream artifact when extracted from x402 v1/v2 headers
   * (not a PEAC JWS receipt). Present only when artifactSource is
   * 'x402_v1' or 'x402_v2'. Consumers use extractReceiptFromHeaders()
   * in raw.ts for typed access to upstream receipt structures.
   *
   * This field exists because upstream x402 response artifacts (JSON with
   * format+signature) must NOT be stored in receipt_jws, which is
   * semantically reserved for PEAC compact JWS receipts.
   */
  upstreamArtifact?: ReceiptArtifactResult;
}

/** Async extraction result */
export interface X402ExtractAsyncResult extends X402ExtractResult {
  violations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultX402Meta(): CarrierMeta {
  return {
    transport: 'x402',
    format: 'embed',
    max_size: X402_CARRIER_LIMITS.headers,
  };
}

/**
 * Case-insensitive header lookup (RFC 9110 field name matching).
 */
function findHeader(headers: X402HeaderMap, target: string): string | null {
  const targetLower = target.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === targetLower);
  if (!key) return null;
  const value = headers[key];
  return value && value.length > 0 ? value : null;
}

/**
 * Extract receipt artifact from headers with priority fallback (DD-193).
 *
 * Priority:
 *   1. PEAC-Receipt (PEAC carrier contract)
 *   2. PAYMENT-RESPONSE (x402 v2)
 *   3. X-PAYMENT-RESPONSE (x402 v1)
 *
 * Only receipt/response artifacts are handled here.
 * PAYMENT-REQUIRED (challenge material) is NOT included in this path.
 */
export function extractReceiptArtifactFromHeaders(
  headers: X402HeaderMap
): ReceiptArtifactResult | null {
  // Priority 1: PEAC-Receipt (always preferred; this IS a PEAC signed receipt)
  const peacValue = findHeader(headers, PEAC_RECEIPT_HEADER);
  if (peacValue) {
    return {
      source: 'peac',
      headerName: PEAC_RECEIPT_HEADER,
      rawArtifact: peacValue,
      artifactKind: 'receipt',
      artifactFormat: 'jws',
      isPeacReceipt: true,
    };
  }

  // Priority 2: PAYMENT-RESPONSE (x402 v2)
  // This is an upstream observational artifact, NOT a PEAC receipt.
  // Contains x402 response data (typically JSON with format+signature).
  const v2Value = findHeader(headers, X402_V2_RECEIPT_HEADER);
  if (v2Value) {
    return {
      source: 'x402_v2',
      headerName: X402_V2_RECEIPT_HEADER,
      rawArtifact: v2Value,
      parsedForm: tryParseJson(v2Value),
      artifactKind: 'receipt',
      artifactFormat: tryParseJson(v2Value) !== undefined ? 'json' : 'unknown',
      isPeacReceipt: false,
    };
  }

  // Priority 3: X-PAYMENT-RESPONSE (x402 v1)
  // Same as v2: upstream observational artifact, not a PEAC receipt.
  const v1Value = findHeader(headers, X402_V1_RECEIPT_HEADER);
  if (v1Value) {
    return {
      source: 'x402_v1',
      headerName: X402_V1_RECEIPT_HEADER,
      rawArtifact: v1Value,
      parsedForm: tryParseJson(v1Value),
      artifactKind: 'receipt',
      artifactFormat: tryParseJson(v1Value) !== undefined ? 'json' : 'unknown',
      isPeacReceipt: false,
    };
  }

  return null;
}

/**
 * Best-effort JSON parse; returns undefined on failure.
 */
function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Extract from Offer Response (HTTP 402)
// ---------------------------------------------------------------------------

/**
 * Build a PeacEvidenceCarrier from an extracted artifact.
 *
 * receipt_jws is ONLY populated when the source is 'peac' (actual JWS).
 * For x402 upstream artifacts (JSON with format+signature), receipt_jws
 * is left undefined; the raw upstream artifact is returned separately
 * via upstreamArtifact on the extraction result. This preserves the
 * semantic contract that receipt_jws holds a PEAC compact JWS receipt.
 */
function buildCarrierFromArtifact(
  artifact: ReceiptArtifactResult,
  receiptRef: PeacEvidenceCarrier['receipt_ref'],
  headers: X402HeaderMap
): { carrier: PeacEvidenceCarrier; isUpstream: boolean } {
  const carrier: PeacEvidenceCarrier = { receipt_ref: receiptRef };

  if (artifact.source === 'peac') {
    // PEAC-Receipt IS a compact JWS; safe to store in receipt_jws
    carrier.receipt_jws = artifact.rawArtifact;
  }
  // For x402 upstream: receipt_jws intentionally left undefined.
  // Upstream artifact is carried via upstreamArtifact on the result.

  // receipt_url locator hint (PEAC-specific; not present in x402 upstream)
  const receiptUrl = findHeader(headers, PEAC_RECEIPT_URL_HEADER);
  if (receiptUrl) {
    carrier.receipt_url = receiptUrl;
  }

  return { carrier, isUpstream: artifact.source !== 'peac' };
}

/**
 * Extract carrier from x402 offer response (HTTP 402).
 *
 * v0.12.4: reads PEAC-Receipt first, then falls back to x402 v2/v1 upstream
 * receipt headers (DD-193 dual-header read compatibility).
 *
 * When the artifact is from an upstream x402 header (v1 or v2), receipt_jws
 * is NOT populated on the carrier. The raw upstream artifact is available
 * via the upstreamArtifact field on the result. Consumers should use
 * extractReceiptFromHeaders() in raw.ts for typed access.
 */
export function fromOfferResponse(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): X402ExtractResult | null {
  const artifact = extractReceiptArtifactFromHeaders(headers);
  if (!artifact) return null;

  const placeholderRef =
    'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'];

  const { carrier, isUpstream } = buildCarrierFromArtifact(artifact, placeholderRef, headers);

  return {
    receipts: [carrier],
    meta: {
      ...defaultX402Meta(),
      artifactSource: artifact.source,
      redaction: ['receipt_ref_pending_async'],
    } as CarrierMeta,
    upstreamArtifact: isUpstream ? artifact : undefined,
  };
}

/**
 * Extract carrier from x402 offer response (async).
 *
 * Computes receipt_ref from the raw artifact. For PEAC sources, hashes the
 * JWS. For upstream x402 sources, hashes the raw upstream header value.
 */
export async function fromOfferResponseAsync(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): Promise<X402ExtractAsyncResult | null> {
  const artifact = extractReceiptArtifactFromHeaders(headers);
  if (!artifact) return null;

  const ref = await computeReceiptRef(artifact.rawArtifact);

  const { carrier, isUpstream } = buildCarrierFromArtifact(artifact, ref, headers);

  return {
    receipts: [carrier],
    meta: {
      ...defaultX402Meta(),
      artifactSource: artifact.source,
    } as CarrierMeta,
    violations: [],
    upstreamArtifact: isUpstream ? artifact : undefined,
  };
}

// ---------------------------------------------------------------------------
// Extract from Settlement Response (HTTP 200)
// ---------------------------------------------------------------------------

/**
 * Extract carrier from x402 settlement response (HTTP 200).
 *
 * Reads PEAC-Receipt header for compact JWS.
 */
export function fromSettlementResponse(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): X402ExtractResult | null {
  return fromOfferResponse(headers, _body);
}

/**
 * Extract carrier from x402 settlement response (async).
 */
export async function fromSettlementResponseAsync(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): Promise<X402ExtractAsyncResult | null> {
  return fromOfferResponseAsync(headers, _body);
}

// ---------------------------------------------------------------------------
// X402CarrierAdapter
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter implementation for x402 HTTP responses.
 *
 * v0.11.1: header-only transport. Extracts from and attaches to
 * PEAC-Receipt header. Requires receipt_jws for attachment.
 */
export class X402CarrierAdapter implements CarrierAdapter<X402ResponseLike, X402ResponseLike> {
  extract(input: X402ResponseLike): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    if (!input.headers) return null;
    return fromOfferResponse(input.headers, input.body);
  }

  attach(
    output: X402ResponseLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): X402ResponseLike {
    if (carriers.length === 0) return output;

    const carrier = carriers[0];
    if (!carrier.receipt_jws) {
      throw new Error('x402 carrier requires receipt_jws (embed format) in v0.11.1');
    }

    const effectiveMeta = meta ?? defaultX402Meta();

    const validation = validateCarrierConstraints(carrier, effectiveMeta);
    if (!validation.valid) {
      throw new Error(`Carrier constraint violation: ${validation.violations.join('; ')}`);
    }

    if (!output.headers) {
      output.headers = {};
    }

    output.headers[PEAC_RECEIPT_HEADER] = carrier.receipt_jws;

    if (carrier.receipt_url) {
      output.headers[PEAC_RECEIPT_URL_HEADER] = carrier.receipt_url;
    }

    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
