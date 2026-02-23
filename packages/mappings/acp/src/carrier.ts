/**
 * ACP carrier adapter for Evidence Carrier Contract (DD-124).
 *
 * v0.11.1: header-only embed transport via PEAC-Receipt (compact JWS).
 * All size limits enforce the 8 KB header ceiling (acp_headers).
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
  validateCarrierConstraints,
  computeReceiptRef,
  CARRIER_TRANSPORT_LIMITS,
} from '@peac/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ACP carrier size limits */
export const ACP_CARRIER_LIMITS = {
  embed: CARRIER_TRANSPORT_LIMITS.acp_embed,
  headers: CARRIER_TRANSPORT_LIMITS.acp_headers,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simple header map */
export type HeaderMap = Record<string, string>;

/** ACP message with headers and optional body */
export interface AcpMessageLike {
  headers?: HeaderMap;
  body?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Extraction result */
export interface AcpExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
}

/** Async extraction result with consistency violations */
export interface AcpExtractAsyncResult extends AcpExtractResult {
  violations: string[];
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/**
 * Attach carrier to ACP headers.
 *
 * Sets PEAC-Receipt header with compact JWS.
 * Requires receipt_jws; reference mode is not supported in v0.11.1.
 */
export function attachCarrierToACPHeaders(
  headers: HeaderMap,
  carrier: PeacEvidenceCarrier
): HeaderMap {
  if (!carrier.receipt_jws) {
    throw new Error('ACP carrier requires receipt_jws (embed format) in v0.11.1');
  }
  headers[PEAC_RECEIPT_HEADER] = carrier.receipt_jws;
  return headers;
}

/**
 * Attach carrier to ACP message via headers.
 *
 * Enforces header-sized limits (8 KB) since ACP v0.11.1 uses
 * PEAC-Receipt header as the sole transport surface.
 */
export function attachCarrierToACPMessage(
  msg: AcpMessageLike,
  carrier: PeacEvidenceCarrier
): AcpMessageLike {
  const meta: CarrierMeta = {
    transport: 'acp',
    format: 'embed',
    max_size: ACP_CARRIER_LIMITS.headers,
  };

  const validation = validateCarrierConstraints(carrier, meta);
  if (!validation.valid) {
    throw new Error(`Carrier constraint violation: ${validation.violations.join('; ')}`);
  }

  if (!msg.headers) {
    msg.headers = {};
  }
  attachCarrierToACPHeaders(msg.headers, carrier);

  return msg;
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

/**
 * Extract carrier from ACP headers (sync).
 *
 * Reads PEAC-Receipt header as compact JWS and computes receipt_ref.
 * Note: receipt_ref computation requires async; sync version returns a
 * placeholder. Use extractCarrierFromACPHeadersAsync for full validation.
 */
export function extractCarrierFromACPHeaders(headers: HeaderMap): AcpExtractResult | null {
  // Case-insensitive header lookup per RFC 9110
  const headerKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === PEAC_RECEIPT_HEADER.toLowerCase()
  );

  if (!headerKey) return null;

  const jws = headers[headerKey];
  if (!jws || jws.length === 0) return null;

  // JWS from header: create carrier with placeholder ref (async computes real ref)
  const carrier: PeacEvidenceCarrier = {
    receipt_ref:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    receipt_jws: jws,
  };

  return {
    receipts: [carrier],
    meta: {
      transport: 'acp',
      format: 'embed',
      max_size: ACP_CARRIER_LIMITS.headers,
      redaction: ['receipt_ref_pending_async'],
    },
  };
}

/**
 * Extract carrier from ACP headers (async, DD-129).
 *
 * Computes receipt_ref from the JWS and validates consistency.
 */
export async function extractCarrierFromACPHeadersAsync(
  headers: HeaderMap
): Promise<AcpExtractAsyncResult | null> {
  const headerKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === PEAC_RECEIPT_HEADER.toLowerCase()
  );

  if (!headerKey) return null;

  const jws = headers[headerKey];
  if (!jws || jws.length === 0) return null;

  const ref = await computeReceiptRef(jws);
  const carrier: PeacEvidenceCarrier = {
    receipt_ref: ref,
    receipt_jws: jws,
  };

  return {
    receipts: [carrier],
    meta: {
      transport: 'acp',
      format: 'embed',
      max_size: ACP_CARRIER_LIMITS.headers,
    },
    violations: [],
  };
}

// ---------------------------------------------------------------------------
// AcpCarrierAdapter
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter implementation for ACP messages.
 */
export class AcpCarrierAdapter implements CarrierAdapter<AcpMessageLike, AcpMessageLike> {
  extract(input: AcpMessageLike): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    if (!input.headers) return null;
    return extractCarrierFromACPHeaders(input.headers);
  }

  attach(
    output: AcpMessageLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): AcpMessageLike {
    if (carriers.length > 0) {
      attachCarrierToACPMessage(output, carriers[0]);
    }
    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
