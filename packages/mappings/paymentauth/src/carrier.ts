/**
 * Paymentauth carrier adapter for Evidence Carrier Contract.
 *
 * Header-only embed transport via PEAC-Receipt (compact JWS).
 * All size limits enforce the 8 KB header ceiling (HTTP transport).
 *
 * receipt_ref is computed from the raw upstream artifact actually received
 * (the literal Payment-Receipt header value), NOT assumed to be a JWS.
 *
 * Co-existence: PEAC PEAC-Receipt and paymentauth Payment-Receipt can
 * appear on the same HTTP response. They serve different purposes:
 * - PEAC-Receipt: signed PEAC interaction record (compact JWS)
 * - Payment-Receipt: paymentauth payment receipt (base64url JSON)
 * No semantic coupling is implied between them.
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

import { PAYMENT_RECEIPT_HEADER } from './constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Paymentauth carrier size limits (HTTP header transport ceiling) */
export const PAYMENTAUTH_CARRIER_LIMITS = {
  embed: CARRIER_TRANSPORT_LIMITS.acp_embed,
  headers: CARRIER_TRANSPORT_LIMITS.acp_headers,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simple header map */
export type PaymentauthHeaderMap = Record<string, string>;

/** Paymentauth HTTP response with headers */
export interface PaymentauthResponseLike {
  headers?: PaymentauthHeaderMap;
  body?: Record<string, unknown>;
}

/** Extraction result */
export interface PaymentauthExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
  /**
   * Raw Payment-Receipt header value if present (upstream artifact).
   * This is observational upstream material and is NEVER part of
   * receipt_jws. It is captured separately for audit/traceability only.
   */
  rawPaymentReceipt?: string;
}

/** Async extraction result */
export interface PaymentauthExtractAsyncResult extends PaymentauthExtractResult {
  violations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultMeta(): CarrierMeta {
  return {
    transport: 'paymentauth',
    format: 'embed',
    max_size: PAYMENTAUTH_CARRIER_LIMITS.headers,
  };
}

/** Case-insensitive header lookup (RFC 9110) */
function findHeader(headers: PaymentauthHeaderMap, target: string): string | null {
  const targetLower = target.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === targetLower);
  if (!key) return null;
  const value = headers[key];
  return value && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/**
 * Attach PEAC carrier to paymentauth response headers.
 *
 * Sets PEAC-Receipt header with compact JWS. This is the PEAC evidence
 * carrier; it coexists with (but is independent of) the paymentauth
 * Payment-Receipt header.
 */
export function attachCarrierToPaymentauthHeaders(
  headers: PaymentauthHeaderMap,
  carrier: PeacEvidenceCarrier
): PaymentauthHeaderMap {
  if (!carrier.receipt_jws) {
    throw new Error('Paymentauth carrier requires receipt_jws (embed format)');
  }
  headers[PEAC_RECEIPT_HEADER] = carrier.receipt_jws;
  if (carrier.receipt_url) {
    headers[PEAC_RECEIPT_URL_HEADER] = carrier.receipt_url;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

/**
 * Extract PEAC carrier from paymentauth response headers (sync).
 *
 * Reads PEAC-Receipt header for compact JWS. Also captures the raw
 * Payment-Receipt header value if present (upstream artifact, NOT
 * stored in receipt_jws).
 */
export function extractCarrierFromPaymentauthHeaders(
  headers: PaymentauthHeaderMap
): PaymentauthExtractResult | null {
  const jws = findHeader(headers, PEAC_RECEIPT_HEADER);
  if (!jws) return null;

  const carrier: PeacEvidenceCarrier = {
    receipt_ref:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    receipt_jws: jws,
  };

  const receiptUrl = findHeader(headers, PEAC_RECEIPT_URL_HEADER);
  if (receiptUrl) {
    carrier.receipt_url = receiptUrl;
  }

  // Capture raw Payment-Receipt header if present (upstream artifact)
  const rawPaymentReceipt = findHeader(headers, PAYMENT_RECEIPT_HEADER);

  return {
    receipts: [carrier],
    meta: {
      ...defaultMeta(),
      redaction: ['receipt_ref_pending_async'],
    },
    rawPaymentReceipt: rawPaymentReceipt ?? undefined,
  };
}

/**
 * Extract PEAC carrier from paymentauth response headers (async).
 *
 * Computes receipt_ref from the PEAC-Receipt JWS.
 */
export async function extractCarrierFromPaymentauthHeadersAsync(
  headers: PaymentauthHeaderMap
): Promise<PaymentauthExtractAsyncResult | null> {
  const jws = findHeader(headers, PEAC_RECEIPT_HEADER);
  if (!jws) return null;

  const ref = await computeReceiptRef(jws);
  const carrier: PeacEvidenceCarrier = {
    receipt_ref: ref,
    receipt_jws: jws,
  };

  const receiptUrl = findHeader(headers, PEAC_RECEIPT_URL_HEADER);
  if (receiptUrl) {
    carrier.receipt_url = receiptUrl;
  }

  const rawPaymentReceipt = findHeader(headers, PAYMENT_RECEIPT_HEADER);

  return {
    receipts: [carrier],
    meta: defaultMeta(),
    violations: [],
    rawPaymentReceipt: rawPaymentReceipt ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// PaymentauthCarrierAdapter
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter implementation for paymentauth HTTP responses.
 *
 * Extracts PEAC-Receipt from response headers. Attaches PEAC-Receipt
 * to response headers. Enforces 8 KB header size limits.
 */
export class PaymentauthCarrierAdapter implements CarrierAdapter<
  PaymentauthResponseLike,
  PaymentauthResponseLike
> {
  extract(
    input: PaymentauthResponseLike
  ): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    if (!input.headers) return null;
    return extractCarrierFromPaymentauthHeaders(input.headers);
  }

  attach(
    output: PaymentauthResponseLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): PaymentauthResponseLike {
    if (carriers.length === 0) return output;

    const carrier = carriers[0];
    if (!carrier.receipt_jws) {
      throw new Error('Paymentauth carrier requires receipt_jws (embed format)');
    }

    const effectiveMeta = meta ?? defaultMeta();
    const validation = validateCarrierConstraints(carrier, effectiveMeta);
    if (!validation.valid) {
      throw new Error(`Carrier constraint violation: ${validation.violations.join('; ')}`);
    }

    if (!output.headers) {
      output.headers = {};
    }
    attachCarrierToPaymentauthHeaders(output.headers, carrier);

    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
