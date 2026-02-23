/**
 * A2A carrier adapter implementing CarrierAdapter<A2ATaskStatusLike, A2ATaskStatusLike>.
 *
 * Bridges PeacEvidenceCarrier to A2A TaskStatus metadata per DD-124.
 */

import type {
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from '@peac/kernel';
import { validateCarrierConstraints } from '@peac/schema';

import type { A2ATaskStatusLike } from './types';
import { A2A_MAX_CARRIER_SIZE } from './types';
import { attachReceiptToTaskStatus } from './attach';
import { extractReceiptFromTaskStatus } from './extract';

/**
 * CarrierAdapter implementation for A2A TaskStatus messages.
 *
 * Uses metadata[PEAC_EXTENSION_URI] = { carriers: [...] } layout.
 */
export class A2ACarrierAdapter
  implements CarrierAdapter<A2ATaskStatusLike, A2ATaskStatusLike>
{
  extract(
    input: A2ATaskStatusLike
  ): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    return extractReceiptFromTaskStatus(input);
  }

  attach(
    output: A2ATaskStatusLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): A2ATaskStatusLike {
    return attachReceiptToTaskStatus(output, carriers, meta);
  }

  validateConstraints(
    carrier: PeacEvidenceCarrier,
    meta: CarrierMeta
  ): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}

/** Default CarrierMeta for A2A transport */
export function createA2ACarrierMeta(
  overrides?: Partial<CarrierMeta>
): CarrierMeta {
  return {
    transport: 'a2a',
    format: 'embed',
    max_size: A2A_MAX_CARRIER_SIZE,
    ...overrides,
  };
}
