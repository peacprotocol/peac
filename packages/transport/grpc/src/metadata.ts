/**
 * gRPC metadata keys, types, and helpers for PEAC transport.
 *
 * Extracted to a separate module to avoid circular imports between
 * index.ts and a2a-carrier.ts.
 */

import { WIRE_02_JWS_TYP } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** gRPC metadata shape for PEAC carrier operations */
export type GrpcMetadataLike = Record<string, string | string[] | undefined>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * gRPC metadata keys for PEAC transport.
 */
export const GrpcMetadataKeys = {
  /** PEAC receipt in metadata */
  RECEIPT: 'peac-receipt',
  /** PEAC receipt type */
  RECEIPT_TYPE: 'peac-receipt-type',
  /** TAP signature */
  TAP_SIGNATURE: 'peac-tap-signature',
  /** TAP signature input */
  TAP_SIGNATURE_INPUT: 'peac-tap-signature-input',
  /** PEAC error code in trailer */
  ERROR_CODE: 'peac-error-code',
  /** Request ID for tracing */
  REQUEST_ID: 'peac-request-id',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract PEAC receipt from gRPC metadata.
 */
export function extractReceiptFromMetadata(metadata: GrpcMetadataLike): string | null {
  const receipt = metadata[GrpcMetadataKeys.RECEIPT];
  if (typeof receipt === 'string') {
    return receipt;
  }
  if (Array.isArray(receipt) && receipt.length > 0) {
    return receipt[0];
  }
  return null;
}

/**
 * Extract receipt type from gRPC metadata.
 */
export function extractReceiptTypeFromMetadata(metadata: GrpcMetadataLike): string | null {
  const typ = metadata[GrpcMetadataKeys.RECEIPT_TYPE];
  if (typeof typ === 'string') {
    return typ;
  }
  if (Array.isArray(typ) && typ.length > 0) {
    return typ[0];
  }
  return null;
}

/**
 * Add PEAC receipt to gRPC metadata.
 *
 * @param metadata - gRPC metadata object to modify
 * @param receiptJws - Compact JWS of the signed receipt
 * @param receiptType - Receipt typ value (defaults to Wire 0.2 `interaction-record+jwt`)
 */
export function addReceiptToMetadata(
  metadata: Record<string, string | string[]>,
  receiptJws: string,
  receiptType: string = WIRE_02_JWS_TYP
): void {
  metadata[GrpcMetadataKeys.RECEIPT] = receiptJws;
  metadata[GrpcMetadataKeys.RECEIPT_TYPE] = receiptType;
}
