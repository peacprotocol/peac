/**
 * UCP carrier adapter for Evidence Carrier Contract (DD-124).
 *
 * Normalizes UCP webhook evidence to PeacEvidenceCarrier format
 * and attaches carriers to webhook payloads via peac_evidence field.
 */

import type {
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from '@peac/kernel';
import {
  PeacEvidenceCarrierSchema,
  validateCarrierConstraints,
  verifyReceiptRefConsistency,
} from '@peac/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UCP carrier max size (64 KB, DD-127) */
export const UCP_MAX_CARRIER_SIZE = 65_536;

/** Legacy extension key for interaction evidence */
export const UCP_LEGACY_EXTENSION_KEY = 'org.peacprotocol/interaction@0.1' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** UCP webhook payload with optional evidence */
export interface UcpWebhookPayload {
  event_type?: string;
  peac_evidence?: PeacEvidenceCarrier;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Extraction result */
export interface UcpExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
}

/** Async extraction result */
export interface UcpExtractAsyncResult extends UcpExtractResult {
  violations: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultUcpMeta(): CarrierMeta {
  return {
    transport: 'ucp',
    format: 'embed',
    max_size: UCP_MAX_CARRIER_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/**
 * Attach carrier to UCP webhook payload.
 *
 * Writes to `peac_evidence` field. Validates carrier constraints before placement.
 */
export function attachCarrierToWebhookPayload(
  payload: UcpWebhookPayload,
  carrier: PeacEvidenceCarrier,
  meta?: CarrierMeta
): UcpWebhookPayload {
  const effectiveMeta = meta ?? defaultUcpMeta();

  const validation = validateCarrierConstraints(carrier, effectiveMeta);
  if (!validation.valid) {
    throw new Error(`Carrier constraint violation: ${validation.violations.join('; ')}`);
  }

  payload.peac_evidence = carrier;
  return payload;
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

/**
 * Extract carrier from UCP webhook payload (sync).
 *
 * Reads from `peac_evidence` field, with fallback to legacy
 * extensions["org.peacprotocol/interaction@0.1"] key.
 */
export function extractCarrierFromWebhookPayload(
  payload: UcpWebhookPayload
): UcpExtractResult | null {
  const meta = defaultUcpMeta();

  // 1. Try peac_evidence field
  if (payload.peac_evidence) {
    const parsed = PeacEvidenceCarrierSchema.safeParse(payload.peac_evidence);
    if (parsed.success) {
      return { receipts: [parsed.data as PeacEvidenceCarrier], meta };
    }
  }

  // 2. Try legacy extension key
  if (payload.extensions) {
    const legacyData = payload.extensions[UCP_LEGACY_EXTENSION_KEY];
    if (legacyData && typeof legacyData === 'object') {
      const parsed = PeacEvidenceCarrierSchema.safeParse(legacyData);
      if (parsed.success) {
        return { receipts: [parsed.data as PeacEvidenceCarrier], meta };
      }
    }
  }

  return null;
}

/**
 * Extract carrier from UCP webhook payload (async, DD-129).
 *
 * Performs structural validation AND receipt_ref consistency check.
 */
export async function extractCarrierFromWebhookPayloadAsync(
  payload: UcpWebhookPayload
): Promise<UcpExtractAsyncResult | null> {
  const syncResult = extractCarrierFromWebhookPayload(payload);
  if (syncResult === null) return null;

  const violations: string[] = [];
  const validCarriers: PeacEvidenceCarrier[] = [];

  for (const carrier of syncResult.receipts) {
    const error = await verifyReceiptRefConsistency(carrier);
    if (error !== null) {
      violations.push(error);
    } else {
      validCarriers.push(carrier);
    }
  }

  return { receipts: validCarriers, meta: syncResult.meta, violations };
}

// ---------------------------------------------------------------------------
// UcpCarrierAdapter
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter implementation for UCP webhook payloads.
 */
export class UcpCarrierAdapter implements CarrierAdapter<UcpWebhookPayload, UcpWebhookPayload> {
  extract(input: UcpWebhookPayload): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    return extractCarrierFromWebhookPayload(input);
  }

  attach(
    output: UcpWebhookPayload,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): UcpWebhookPayload {
    if (carriers.length > 0) {
      attachCarrierToWebhookPayload(output, carriers[0], meta);
    }
    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
