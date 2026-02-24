/**
 * MCP _meta carrier format (DD-125).
 *
 * Attach and extract PEAC evidence carriers using MCP _meta keys.
 * Uses reverse-DNS keys under "org.peacprotocol/" prefix.
 *
 * New format (v0.11.1+):
 *   _meta["org.peacprotocol/receipt_ref"]  = "sha256:..."
 *   _meta["org.peacprotocol/receipt_jws"]  = "eyJ..."
 *
 * Legacy format (v0.10.13):
 *   _meta["org.peacprotocol/receipt"]      = "eyJ..." (JWS only, no receipt_ref)
 */

import type {
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from '@peac/kernel';
import {
  PeacEvidenceCarrierSchema,
  computeReceiptRef,
  validateCarrierConstraints,
  verifyReceiptRefConsistency,
  CARRIER_TRANSPORT_LIMITS,
} from '@peac/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** _meta key for receipt reference (v0.11.1+) */
export const META_KEY_RECEIPT_REF = 'org.peacprotocol/receipt_ref' as const;

/** _meta key for receipt JWS (v0.11.1+) */
export const META_KEY_RECEIPT_JWS = 'org.peacprotocol/receipt_jws' as const;

/** _meta key for agent ID (v0.10.13+, unchanged) */
export const META_KEY_AGENT_ID = 'org.peacprotocol/agent_id' as const;

/** _meta key for verification timestamp (v0.10.13+, unchanged) */
export const META_KEY_VERIFIED_AT = 'org.peacprotocol/verified_at' as const;

/** _meta key for receipt URL locator hint (v0.11.2+, DD-135) */
export const META_KEY_RECEIPT_URL = 'org.peacprotocol/receipt_url' as const;

/** Legacy _meta key for receipt JWS (v0.10.13, DD-125) */
export const META_KEY_LEGACY_RECEIPT = 'org.peacprotocol/receipt' as const;

/** Maximum carrier size for MCP _meta (64 KB, DD-127) */
export const MCP_MAX_CARRIER_SIZE = CARRIER_TRANSPORT_LIMITS.mcp;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** MCP _meta object */
export type McpMeta = Record<string, unknown>;

/** MCP JSON-RPC result with _meta */
export interface McpResultLike {
  _meta?: McpMeta;
  [key: string]: unknown;
}

/** Options for attachReceiptToMeta */
export interface AttachMetaOptions {
  /** Use legacy format (v0.10.13 peac_receipt key). Default: false */
  legacyFormat?: boolean;
  /** Agent ID to include in _meta */
  agentId?: string;
  /** Verification timestamp (ISO 8601) */
  verifiedAt?: string;
}

/** Result of extraction */
export interface McpExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
}

/** Async extraction result with consistency violations */
export interface McpExtractAsyncResult extends McpExtractResult {
  violations: string[];
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/**
 * Attach PEAC evidence carrier to MCP _meta.
 *
 * Default format (v0.11.1+): writes receipt_ref and receipt_jws as separate keys.
 * Legacy format (opts.legacyFormat): writes single "receipt" key (DD-125 phase 1).
 */
export function attachReceiptToMeta(
  result: McpResultLike,
  carrier: PeacEvidenceCarrier,
  opts?: AttachMetaOptions
): McpResultLike {
  const meta: CarrierMeta = {
    transport: 'mcp',
    format: 'embed',
    max_size: MCP_MAX_CARRIER_SIZE,
  };

  const validation = validateCarrierConstraints(carrier, meta);
  if (!validation.valid) {
    throw new Error(`Carrier constraint violation: ${validation.violations.join('; ')}`);
  }

  if (!result._meta) {
    result._meta = {};
  }

  if (opts?.legacyFormat) {
    // DD-125 legacy format: single JWS string
    if (carrier.receipt_jws) {
      result._meta[META_KEY_LEGACY_RECEIPT] = carrier.receipt_jws;
    }
  } else {
    // v0.11.1+ carrier format
    result._meta[META_KEY_RECEIPT_REF] = carrier.receipt_ref;
    if (carrier.receipt_jws) {
      result._meta[META_KEY_RECEIPT_JWS] = carrier.receipt_jws;
    }
    if (carrier.receipt_url) {
      result._meta[META_KEY_RECEIPT_URL] = carrier.receipt_url;
    }
  }

  // Optional metadata fields (unchanged from v0.10.13)
  if (opts?.agentId) {
    result._meta[META_KEY_AGENT_ID] = opts.agentId;
  }
  if (opts?.verifiedAt) {
    result._meta[META_KEY_VERIFIED_AT] = opts.verifiedAt;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extract (sync: structural validation only)
// ---------------------------------------------------------------------------

/**
 * Extract PEAC evidence carrier from MCP _meta (sync).
 *
 * Reads in order (DD-125):
 * 1. New carrier keys (receipt_ref + receipt_jws)
 * 2. Legacy key (org.peacprotocol/receipt, v0.10.13)
 *
 * For legacy format, computes receipt_ref from the JWS to return a proper
 * PeacEvidenceCarrier (Polish B). Note: this requires async for the hash,
 * so the sync version uses a placeholder receipt_ref for legacy and marks
 * it in the meta. Use extractReceiptFromMetaAsync for full validation.
 */
export function extractReceiptFromMeta(result: McpResultLike): McpExtractResult | null {
  if (!result._meta) return null;

  const meta: CarrierMeta = {
    transport: 'mcp',
    format: 'embed',
    max_size: MCP_MAX_CARRIER_SIZE,
  };

  // 1. Try new format (v0.11.1+)
  const receiptRef = result._meta[META_KEY_RECEIPT_REF];
  if (typeof receiptRef === 'string') {
    const carrier: Record<string, unknown> = { receipt_ref: receiptRef };
    const receiptJws = result._meta[META_KEY_RECEIPT_JWS];
    if (typeof receiptJws === 'string') {
      carrier.receipt_jws = receiptJws;
    }
    const receiptUrl = result._meta[META_KEY_RECEIPT_URL];
    if (typeof receiptUrl === 'string') {
      carrier.receipt_url = receiptUrl;
    }

    const parsed = PeacEvidenceCarrierSchema.safeParse(carrier);
    if (parsed.success) {
      return { receipts: [parsed.data as PeacEvidenceCarrier], meta };
    }
  }

  // 2. Try legacy format (v0.10.13, DD-125 + Polish B)
  const legacyReceipt = result._meta[META_KEY_LEGACY_RECEIPT];
  if (typeof legacyReceipt === 'string' && legacyReceipt.length > 0) {
    // Legacy format has JWS only; we can't compute receipt_ref synchronously.
    // Return the JWS in a carrier with a placeholder ref that extractAsync will fix.
    // For sync extraction, we skip schema validation of receipt_ref since we can't
    // compute it without async. Return the raw data and let async handle integrity.
    return {
      receipts: [
        {
          receipt_ref:
            'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
          receipt_jws: legacyReceipt,
        },
      ],
      meta: { ...meta, redaction: ['legacy_receipt_ref_pending'] },
    };
  }

  return null;
}

/**
 * Extract PEAC evidence carrier from MCP _meta (async, DD-129).
 *
 * Performs structural validation AND receipt_ref consistency check.
 * For legacy format (v0.10.13), computes receipt_ref from JWS (Polish B).
 */
export async function extractReceiptFromMetaAsync(
  result: McpResultLike
): Promise<McpExtractAsyncResult | null> {
  if (!result._meta) return null;

  const meta: CarrierMeta = {
    transport: 'mcp',
    format: 'embed',
    max_size: MCP_MAX_CARRIER_SIZE,
  };

  // 1. Try new format (v0.11.1+)
  const receiptRef = result._meta[META_KEY_RECEIPT_REF];
  if (typeof receiptRef === 'string') {
    const carrier: Record<string, unknown> = { receipt_ref: receiptRef };
    const receiptJws = result._meta[META_KEY_RECEIPT_JWS];
    if (typeof receiptJws === 'string') {
      carrier.receipt_jws = receiptJws;
    }
    const receiptUrl = result._meta[META_KEY_RECEIPT_URL];
    if (typeof receiptUrl === 'string') {
      carrier.receipt_url = receiptUrl;
    }

    const parsed = PeacEvidenceCarrierSchema.safeParse(carrier);
    if (parsed.success) {
      const validCarrier = parsed.data as PeacEvidenceCarrier;
      const error = await verifyReceiptRefConsistency(validCarrier);
      const violations = error ? [error] : [];
      return {
        receipts: error ? [] : [validCarrier],
        meta,
        violations,
      };
    }
  }

  // 2. Try legacy format (v0.10.13, DD-125 + Polish B)
  const legacyReceipt = result._meta[META_KEY_LEGACY_RECEIPT];
  if (typeof legacyReceipt === 'string' && legacyReceipt.length > 0) {
    // Compute receipt_ref from legacy JWS
    const computedRef = await computeReceiptRef(legacyReceipt);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: computedRef,
      receipt_jws: legacyReceipt,
    };
    return { receipts: [carrier], meta, violations: [] };
  }

  return null;
}

// ---------------------------------------------------------------------------
// McpCarrierAdapter
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter implementation for MCP _meta format.
 */
export class McpCarrierAdapter implements CarrierAdapter<McpResultLike, McpResultLike> {
  extract(input: McpResultLike): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    return extractReceiptFromMeta(input);
  }

  attach(
    output: McpResultLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): McpResultLike {
    // Attach first carrier (MCP typically carries one receipt per response)
    if (carriers.length > 0) {
      attachReceiptToMeta(output, carriers[0]);
    }
    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}
