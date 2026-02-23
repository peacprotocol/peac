/**
 * Attach PEAC evidence carriers to A2A metadata.
 *
 * Places carrier data under metadata[PEAC_EXTENSION_URI] per A2A v0.3.0
 * metadata convention (DD-128). Uses computeReceiptRef() from @peac/schema
 * for receipt reference computation (correction item 4).
 */

import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { validateCarrierConstraints } from '@peac/schema';

import type {
  A2AMetadata,
  A2ATaskStatusLike,
  A2AMessageLike,
  A2AArtifactLike,
  A2APeacPayload,
} from './types';
import { PEAC_EXTENSION_URI, A2A_MAX_CARRIER_SIZE } from './types';

// ---------------------------------------------------------------------------
// Default meta for A2A transport
// ---------------------------------------------------------------------------

function defaultA2AMeta(): CarrierMeta {
  return {
    transport: 'a2a',
    format: 'embed',
    max_size: A2A_MAX_CARRIER_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Core attach: metadata map
// ---------------------------------------------------------------------------

/**
 * Attach PEAC evidence carrier(s) to an A2A metadata map.
 *
 * Writes `metadata[PEAC_EXTENSION_URI] = { carriers: [...], meta }`.
 * Validates carrier constraints before attachment; throws on violation.
 *
 * @returns The modified metadata map (mutated in place and returned)
 */
export function attachReceiptToMetadata(
  metadata: A2AMetadata,
  carriers: PeacEvidenceCarrier[],
  meta?: CarrierMeta
): A2AMetadata {
  const effectiveMeta = meta ?? defaultA2AMeta();

  for (const carrier of carriers) {
    const result = validateCarrierConstraints(carrier, effectiveMeta);
    if (!result.valid) {
      throw new Error(`Carrier constraint violation: ${result.violations.join('; ')}`);
    }
  }

  const payload: A2APeacPayload = { carriers, meta: effectiveMeta };
  metadata[PEAC_EXTENSION_URI] = payload;
  return metadata;
}

// ---------------------------------------------------------------------------
// Convenience: attach to A2A message types
// ---------------------------------------------------------------------------

/**
 * Attach PEAC evidence carrier(s) to an A2A TaskStatus.
 * Initializes `metadata` if absent.
 */
export function attachReceiptToTaskStatus(
  status: A2ATaskStatusLike,
  carriers: PeacEvidenceCarrier[],
  meta?: CarrierMeta
): A2ATaskStatusLike {
  if (!status.metadata) {
    status.metadata = {};
  }
  attachReceiptToMetadata(status.metadata, carriers, meta);
  return status;
}

/**
 * Attach PEAC evidence carrier(s) to an A2A Message.
 * Initializes `metadata` if absent.
 */
export function attachReceiptToMessage(
  msg: A2AMessageLike,
  carriers: PeacEvidenceCarrier[],
  meta?: CarrierMeta
): A2AMessageLike {
  if (!msg.metadata) {
    msg.metadata = {};
  }
  attachReceiptToMetadata(msg.metadata, carriers, meta);
  return msg;
}

/**
 * Attach PEAC evidence carrier(s) to an A2A Artifact.
 * Initializes `metadata` if absent.
 */
export function attachReceiptToArtifact(
  artifact: A2AArtifactLike,
  carriers: PeacEvidenceCarrier[],
  meta?: CarrierMeta
): A2AArtifactLike {
  if (!artifact.metadata) {
    artifact.metadata = {};
  }
  attachReceiptToMetadata(artifact.metadata, carriers, meta);
  return artifact;
}
