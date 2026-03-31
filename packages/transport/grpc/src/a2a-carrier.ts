/**
 * gRPC CarrierAdapter for A2A transport.
 *
 * Implements the PEAC CarrierAdapter interface for gRPC metadata,
 * enabling receipt attach/extract via gRPC metadata keys. Pure TS
 * with no @grpc/grpc-js dependency; consumers bring their own gRPC.
 *
 * Size default: 8 KiB. gRPC metadata rides in HTTP/2 headers where
 * servers commonly enforce an 8 KiB limit. For larger receipts, use
 * reference mode (receipt_url) or negotiate a higher limit with the
 * gRPC server configuration.
 */

import { createHash } from 'node:crypto';

import type {
  CarrierAdapter,
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  ReceiptRef,
} from '@peac/kernel';
import { validateCarrierConstraints } from '@peac/schema';

import {
  GrpcMetadataKeys,
  extractReceiptFromMetadata,
  extractReceiptTypeFromMetadata,
  addReceiptToMetadata,
} from './index.js';
import type { GrpcMetadataLike } from './index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default maximum carrier size for gRPC metadata (8 KiB).
 *
 * gRPC metadata is carried in HTTP/2 headers. Official gRPC guidance
 * warns that servers may limit request headers, with a common default
 * of 8 KiB. This is a conservative interoperability-safe default.
 * Consumers with known larger server limits can override via
 * `createGrpcCarrierMeta({ max_size: ... })`.
 */
export const GRPC_MAX_CARRIER_SIZE = 8_192;

/** Binary metadata key suffix per gRPC convention */
const BINARY_SUFFIX = '-bin';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * CarrierAdapter for gRPC metadata transport.
 *
 * Reads and writes PEAC evidence carriers via `GrpcMetadataKeys.RECEIPT`
 * and `GrpcMetadataKeys.RECEIPT_TYPE` metadata entries.
 *
 * `extract()` computes the real SHA-256 receipt_ref synchronously
 * using Node's `crypto.createHash` (server-first package).
 */
export class A2AGrpcCarrierAdapter implements CarrierAdapter<GrpcMetadataLike, GrpcMetadataLike> {
  /**
   * Extract PEAC evidence carrier from gRPC metadata.
   *
   * Computes the real SHA-256 receipt_ref from the JWS bytes using
   * Node's synchronous crypto.createHash (server-first package).
   * Rejects binary metadata keys (gRPC `-bin` suffix convention).
   *
   * @returns Extracted carrier with computed receipt_ref, or null if absent
   */
  extract(input: GrpcMetadataLike): { receipts: PeacEvidenceCarrier[]; meta: CarrierMeta } | null {
    // Reject binary-encoded PEAC receipt metadata
    const binaryReceiptKey = GrpcMetadataKeys.RECEIPT + BINARY_SUFFIX;
    if (binaryReceiptKey in input) {
      return null;
    }

    const receiptJws = extractReceiptFromMetadata(input);
    if (!receiptJws) return null;

    const digest = createHash('sha256').update(receiptJws).digest('hex');
    const receiptRef = `sha256:${digest}` as ReceiptRef;

    const carrier: PeacEvidenceCarrier = {
      receipt_ref: receiptRef,
      receipt_jws: receiptJws,
    };

    return {
      receipts: [carrier],
      meta: createGrpcCarrierMeta(),
    };
  }

  attach(
    output: GrpcMetadataLike,
    carriers: PeacEvidenceCarrier[],
    meta?: CarrierMeta
  ): GrpcMetadataLike {
    if (carriers.length === 0) return output;

    const carrier = carriers[0];
    const effectiveMeta = meta ?? createGrpcCarrierMeta();
    const result = this.validateConstraints(carrier, effectiveMeta);
    if (!result.valid) {
      throw new Error(`Carrier constraint violation: ${result.violations.join('; ')}`);
    }

    if (carrier.receipt_jws) {
      addReceiptToMetadata(output as Record<string, string | string[]>, carrier.receipt_jws);
    }

    return output;
  }

  validateConstraints(carrier: PeacEvidenceCarrier, meta: CarrierMeta): CarrierValidationResult {
    return validateCarrierConstraints(carrier, meta);
  }
}

/**
 * Create default CarrierMeta for gRPC transport.
 *
 * Default max_size is 8 KiB (HTTP/2 header budget). Override for
 * environments with known larger server limits.
 */
export function createGrpcCarrierMeta(overrides?: Partial<CarrierMeta>): CarrierMeta {
  return {
    transport: 'grpc',
    format: 'embed',
    max_size: GRPC_MAX_CARRIER_SIZE,
    ...overrides,
  };
}

/**
 * Validate that the package's own PEAC metadata key constants are ASCII-safe.
 *
 * This is a repo-level invariant check, not an inbound metadata validator.
 * It verifies that all keys defined in `GrpcMetadataKeys` use only
 * lowercase ASCII letters, digits, hyphens, and underscores per
 * gRPC metadata key requirements.
 *
 * @returns Array of invalid keys (empty if all valid)
 */
export function validateOwnMetadataKeys(): string[] {
  const ASCII_KEY_REGEX = /^[a-z0-9_-]+$/;
  const invalid: string[] = [];
  for (const key of Object.values(GrpcMetadataKeys)) {
    if (!ASCII_KEY_REGEX.test(key)) {
      invalid.push(key);
    }
  }
  return invalid;
}
