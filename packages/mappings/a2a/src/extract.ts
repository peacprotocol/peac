/**
 * Extract PEAC evidence carriers from A2A metadata.
 *
 * Reads carrier data from metadata[PEAC_EXTENSION_URI] and validates
 * against PeacEvidenceCarrierSchema (DD-131). Provides both sync (structural)
 * and async (receipt_ref consistency) extraction paths per DD-129.
 */

import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { PeacEvidenceCarrierSchema, verifyReceiptRefConsistency } from '@peac/schema';

import type {
  A2AMetadata,
  A2ATaskStatusLike,
  A2AMessageLike,
  A2AArtifactLike,
  A2APeacPayload,
} from './types';
import { PEAC_EXTENSION_URI, A2A_MAX_CARRIER_SIZE } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of carrier extraction */
export interface A2AExtractResult {
  receipts: PeacEvidenceCarrier[];
  meta: CarrierMeta;
}

/** Result of async extraction with consistency check */
export interface A2AExtractAsyncResult extends A2AExtractResult {
  /** Consistency violations (empty if all receipts are valid) */
  violations: string[];
}

// ---------------------------------------------------------------------------
// Core extract: metadata map (sync, structural only)
// ---------------------------------------------------------------------------

/**
 * Extract PEAC evidence carriers from A2A metadata (sync).
 *
 * Performs structural validation only (schema check, DD-131).
 * Returns null if no PEAC extension data is present.
 * Silently skips carriers that fail schema validation.
 */
export function extractReceiptFromMetadata(metadata: A2AMetadata): A2AExtractResult | null {
  const raw = metadata[PEAC_EXTENSION_URI];
  if (raw === undefined || raw === null) {
    return null;
  }

  // Validate payload shape
  if (typeof raw !== 'object' || !('carriers' in (raw as object))) {
    return null;
  }

  const payload = raw as A2APeacPayload;
  if (!Array.isArray(payload.carriers) || payload.carriers.length === 0) {
    return null;
  }

  // Validate each carrier against schema (DD-131: validate at extraction)
  const validCarriers: PeacEvidenceCarrier[] = [];
  for (const carrier of payload.carriers) {
    const result = PeacEvidenceCarrierSchema.safeParse(carrier);
    if (result.success) {
      validCarriers.push(result.data as PeacEvidenceCarrier);
    }
  }

  if (validCarriers.length === 0) {
    return null;
  }

  const meta: CarrierMeta = payload.meta ?? {
    transport: 'a2a',
    format: 'embed',
    max_size: A2A_MAX_CARRIER_SIZE,
  };

  return { receipts: validCarriers, meta };
}

/**
 * Extract PEAC evidence carriers from A2A metadata (async, DD-129).
 *
 * Performs structural validation AND receipt_ref consistency check.
 * When receipt_jws is present, verifies sha256(receipt_jws) === receipt_ref.
 * Returns violations array for any carriers that fail the consistency check.
 */
export async function extractReceiptFromMetadataAsync(
  metadata: A2AMetadata
): Promise<A2AExtractAsyncResult | null> {
  const syncResult = extractReceiptFromMetadata(metadata);
  if (syncResult === null) {
    return null;
  }

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

  if (validCarriers.length === 0 && violations.length > 0) {
    return { receipts: [], meta: syncResult.meta, violations };
  }

  return { receipts: validCarriers, meta: syncResult.meta, violations };
}

// ---------------------------------------------------------------------------
// Convenience: extract from A2A message types
// ---------------------------------------------------------------------------

/** Extract carriers from A2A TaskStatus (sync) */
export function extractReceiptFromTaskStatus(status: A2ATaskStatusLike): A2AExtractResult | null {
  if (!status.metadata) return null;
  return extractReceiptFromMetadata(status.metadata);
}

/** Extract carriers from A2A TaskStatus (async, DD-129) */
export async function extractReceiptFromTaskStatusAsync(
  status: A2ATaskStatusLike
): Promise<A2AExtractAsyncResult | null> {
  if (!status.metadata) return null;
  return extractReceiptFromMetadataAsync(status.metadata);
}

/** Extract carriers from A2A Message (sync) */
export function extractReceiptFromMessage(msg: A2AMessageLike): A2AExtractResult | null {
  if (!msg.metadata) return null;
  return extractReceiptFromMetadata(msg.metadata);
}

/** Extract carriers from A2A Message (async, DD-129) */
export async function extractReceiptFromMessageAsync(
  msg: A2AMessageLike
): Promise<A2AExtractAsyncResult | null> {
  if (!msg.metadata) return null;
  return extractReceiptFromMetadataAsync(msg.metadata);
}

/** Extract carriers from A2A Artifact (sync) */
export function extractReceiptFromArtifact(artifact: A2AArtifactLike): A2AExtractResult | null {
  if (!artifact.metadata) return null;
  return extractReceiptFromMetadata(artifact.metadata);
}

/** Extract carriers from A2A Artifact (async, DD-129) */
export async function extractReceiptFromArtifactAsync(
  artifact: A2AArtifactLike
): Promise<A2AExtractAsyncResult | null> {
  if (!artifact.metadata) return null;
  return extractReceiptFromMetadataAsync(artifact.metadata);
}
