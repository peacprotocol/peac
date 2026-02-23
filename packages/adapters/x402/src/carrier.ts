/**
 * x402 carrier adapter for Evidence Carrier Contract (DD-124).
 *
 * v0.11.1: header-only transport via PEAC-Receipt (compact JWS).
 * Extracts from x402 HTTP 402 (offer) and HTTP 200 (settlement) responses.
 * All size limits enforce the 8 KB header ceiling (x402_headers).
 * Reference mode is not supported; receipt_jws is required.
 */

import type {
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from '@peac/kernel';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';
import {
  computeReceiptRef,
  validateCarrierConstraints,
  CARRIER_TRANSPORT_LIMITS,
} from '@peac/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** x402 carrier size limits (DD-127) */
export const X402_CARRIER_LIMITS = {
  embed: CARRIER_TRANSPORT_LIMITS.x402_embed,
  headers: CARRIER_TRANSPORT_LIMITS.x402_headers,
} as const;

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

/** Extraction result */
export interface X402ExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
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
 * Extract JWS from PEAC-Receipt header (case-insensitive per RFC 9110).
 */
function extractJwsFromHeaders(headers: X402HeaderMap): string | null {
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === PEAC_RECEIPT_HEADER.toLowerCase()
  );
  if (!key) return null;
  const value = headers[key];
  return value && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Extract from Offer Response (HTTP 402)
// ---------------------------------------------------------------------------

/**
 * Extract carrier from x402 offer response (HTTP 402).
 *
 * Reads PEAC-Receipt header for compact JWS (header-only in v0.11.1).
 */
export function fromOfferResponse(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): X402ExtractResult | null {
  const jws = extractJwsFromHeaders(headers);
  if (!jws) return null;

  const carrier: PeacEvidenceCarrier = {
    receipt_ref:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    receipt_jws: jws,
  };

  return {
    receipts: [carrier],
    meta: {
      ...defaultX402Meta(),
      redaction: ['receipt_ref_pending_async'],
    },
  };
}

/**
 * Extract carrier from x402 offer response (async, DD-129).
 *
 * Computes receipt_ref from the JWS.
 */
export async function fromOfferResponseAsync(
  headers: X402HeaderMap,
  _body?: Record<string, unknown>
): Promise<X402ExtractAsyncResult | null> {
  const jws = extractJwsFromHeaders(headers);
  if (!jws) return null;

  const ref = await computeReceiptRef(jws);
  const carrier: PeacEvidenceCarrier = {
    receipt_ref: ref,
    receipt_jws: jws,
  };

  return {
    receipts: [carrier],
    meta: defaultX402Meta(),
    violations: [],
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
 * Extract carrier from x402 settlement response (async, DD-129).
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

    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
