/**
 * PEAC gRPC Transport Layer
 *
 * Provides gRPC binding for PEAC receipts with StatusCode parity to HTTP.
 *
 * Status code mapping follows these semantics:
 * - INVALID_ARGUMENT (3): Malformed request (HTTP 400)
 * - UNAUTHENTICATED (16): Authentication required (HTTP 401)
 * - FAILED_PRECONDITION (9): Payment required (HTTP 402)
 * - PERMISSION_DENIED (7): Not authorized (HTTP 403)
 * - ABORTED (10): Conflict/replay detected (HTTP 409)
 * - INTERNAL (13): Server error (HTTP 500)
 *
 * @packageDocumentation
 */

export const GRPC_TRANSPORT_VERSION = '0.9.20' as const;

/**
 * gRPC status codes.
 * @see https://grpc.io/docs/guides/status-codes/
 */
export const GrpcStatus = {
  /** Success */
  OK: 0,
  /** Operation was cancelled */
  CANCELLED: 1,
  /** Unknown error */
  UNKNOWN: 2,
  /** Client specified invalid argument */
  INVALID_ARGUMENT: 3,
  /** Deadline expired before operation completed */
  DEADLINE_EXCEEDED: 4,
  /** Requested entity not found */
  NOT_FOUND: 5,
  /** Entity already exists */
  ALREADY_EXISTS: 6,
  /** Caller lacks permission */
  PERMISSION_DENIED: 7,
  /** Resource exhausted */
  RESOURCE_EXHAUSTED: 8,
  /** Operation rejected due to precondition */
  FAILED_PRECONDITION: 9,
  /** Operation aborted (conflict) */
  ABORTED: 10,
  /** Value out of range */
  OUT_OF_RANGE: 11,
  /** Operation not implemented */
  UNIMPLEMENTED: 12,
  /** Internal error */
  INTERNAL: 13,
  /** Service unavailable */
  UNAVAILABLE: 14,
  /** Data loss */
  DATA_LOSS: 15,
  /** Not authenticated */
  UNAUTHENTICATED: 16,
} as const;

export type GrpcStatusCode = (typeof GrpcStatus)[keyof typeof GrpcStatus];

/**
 * Map HTTP status code to gRPC status code.
 *
 * Mapping semantics:
 * - 400 Bad Request -> INVALID_ARGUMENT (malformed)
 * - 401 Unauthorized -> UNAUTHENTICATED (auth required)
 * - 402 Payment Required -> FAILED_PRECONDITION (payment needed)
 * - 403 Forbidden -> PERMISSION_DENIED (not authorized)
 * - 409 Conflict -> ABORTED (replay detected)
 * - 500 Internal Server Error -> INTERNAL
 * - Other 4xx -> INVALID_ARGUMENT
 * - Other 5xx -> INTERNAL
 */
export function httpStatusToGrpc(httpStatus: number): GrpcStatusCode {
  switch (httpStatus) {
    case 200:
    case 201:
    case 204:
      return GrpcStatus.OK;
    case 400:
      return GrpcStatus.INVALID_ARGUMENT;
    case 401:
      return GrpcStatus.UNAUTHENTICATED;
    case 402:
      return GrpcStatus.FAILED_PRECONDITION;
    case 403:
      return GrpcStatus.PERMISSION_DENIED;
    case 404:
      return GrpcStatus.NOT_FOUND;
    case 409:
      return GrpcStatus.ABORTED;
    case 429:
      return GrpcStatus.RESOURCE_EXHAUSTED;
    case 499:
      return GrpcStatus.CANCELLED;
    case 500:
      return GrpcStatus.INTERNAL;
    case 501:
      return GrpcStatus.UNIMPLEMENTED;
    case 503:
      return GrpcStatus.UNAVAILABLE;
    case 504:
      return GrpcStatus.DEADLINE_EXCEEDED;
    default:
      if (httpStatus >= 400 && httpStatus < 500) {
        return GrpcStatus.INVALID_ARGUMENT;
      }
      if (httpStatus >= 500) {
        return GrpcStatus.INTERNAL;
      }
      return GrpcStatus.OK;
  }
}

/**
 * Map gRPC status code to HTTP status code.
 *
 * Inverse of httpStatusToGrpc for response translation.
 */
export function grpcStatusToHttp(grpcStatus: GrpcStatusCode): number {
  switch (grpcStatus) {
    case GrpcStatus.OK:
      return 200;
    case GrpcStatus.CANCELLED:
      return 499;
    case GrpcStatus.UNKNOWN:
      return 500;
    case GrpcStatus.INVALID_ARGUMENT:
      return 400;
    case GrpcStatus.DEADLINE_EXCEEDED:
      return 504;
    case GrpcStatus.NOT_FOUND:
      return 404;
    case GrpcStatus.ALREADY_EXISTS:
      return 409;
    case GrpcStatus.PERMISSION_DENIED:
      return 403;
    case GrpcStatus.RESOURCE_EXHAUSTED:
      return 429;
    case GrpcStatus.FAILED_PRECONDITION:
      return 402;
    case GrpcStatus.ABORTED:
      return 409;
    case GrpcStatus.OUT_OF_RANGE:
      return 400;
    case GrpcStatus.UNIMPLEMENTED:
      return 501;
    case GrpcStatus.INTERNAL:
      return 500;
    case GrpcStatus.UNAVAILABLE:
      return 503;
    case GrpcStatus.DATA_LOSS:
      return 500;
    case GrpcStatus.UNAUTHENTICATED:
      return 401;
    default:
      return 500;
  }
}

/**
 * PEAC error code to gRPC status mapping.
 *
 * Maps canonical PEAC error codes to appropriate gRPC status codes.
 */
export const PEAC_ERROR_TO_GRPC: Record<string, GrpcStatusCode> = {
  // 402 Payment Required -> FAILED_PRECONDITION
  E_RECEIPT_MISSING: GrpcStatus.FAILED_PRECONDITION,
  E_RECEIPT_INVALID: GrpcStatus.FAILED_PRECONDITION,
  E_RECEIPT_EXPIRED: GrpcStatus.FAILED_PRECONDITION,

  // 401 Unauthenticated -> UNAUTHENTICATED
  E_TAP_SIGNATURE_MISSING: GrpcStatus.UNAUTHENTICATED,
  E_TAP_SIGNATURE_INVALID: GrpcStatus.UNAUTHENTICATED,
  E_TAP_TIME_INVALID: GrpcStatus.UNAUTHENTICATED,
  E_TAP_KEY_NOT_FOUND: GrpcStatus.UNAUTHENTICATED,
  E_TAP_REPLAY_PROTECTION_REQUIRED: GrpcStatus.UNAUTHENTICATED,

  // 400 Bad Request -> INVALID_ARGUMENT
  E_TAP_WINDOW_TOO_LARGE: GrpcStatus.INVALID_ARGUMENT,
  E_TAP_TAG_UNKNOWN: GrpcStatus.INVALID_ARGUMENT,
  E_TAP_ALGORITHM_INVALID: GrpcStatus.INVALID_ARGUMENT,

  // 403 Forbidden -> PERMISSION_DENIED
  E_ISSUER_NOT_ALLOWED: GrpcStatus.PERMISSION_DENIED,

  // 409 Conflict -> ABORTED
  E_TAP_NONCE_REPLAY: GrpcStatus.ABORTED,

  // 500 Internal -> INTERNAL
  E_CONFIG_ISSUER_ALLOWLIST_REQUIRED: GrpcStatus.INTERNAL,
  E_INTERNAL_ERROR: GrpcStatus.INTERNAL,
};

/**
 * Get gRPC status for a PEAC error code.
 */
export function peacErrorToGrpc(errorCode: string): GrpcStatusCode {
  return PEAC_ERROR_TO_GRPC[errorCode] ?? GrpcStatus.INTERNAL;
}

/**
 * gRPC error with status code.
 */
export interface GrpcError {
  /** gRPC status code */
  code: GrpcStatusCode;
  /** Error message */
  message: string;
  /** PEAC error code (if applicable) */
  peacCode?: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * Create a gRPC error from a PEAC error code.
 */
export function createGrpcError(
  peacCode: string,
  message: string,
  details?: unknown
): GrpcError {
  return {
    code: peacErrorToGrpc(peacCode),
    message,
    peacCode,
    details,
  };
}

/**
 * gRPC metadata keys for PEAC transport.
 */
export const GrpcMetadataKeys = {
  /** PEAC receipt in metadata */
  RECEIPT: 'peac-receipt',
  /** PEAC receipt type */
  RECEIPT_TYPE: 'peac-receipt-type',
  /** TAP signature */
  TAP_SIGNATURE: 'x-peac-tap-signature',
  /** TAP signature input */
  TAP_SIGNATURE_INPUT: 'x-peac-tap-signature-input',
  /** PEAC error code in trailer */
  ERROR_CODE: 'peac-error-code',
  /** Request ID for tracing */
  REQUEST_ID: 'peac-request-id',
} as const;

/**
 * Extract PEAC receipt from gRPC metadata.
 */
export function extractReceiptFromMetadata(
  metadata: Record<string, string | string[] | undefined>
): string | null {
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
 * Add PEAC receipt to gRPC metadata.
 */
export function addReceiptToMetadata(
  metadata: Record<string, string | string[]>,
  receiptJws: string
): void {
  metadata[GrpcMetadataKeys.RECEIPT] = receiptJws;
  metadata[GrpcMetadataKeys.RECEIPT_TYPE] = 'peac.receipt/0.9';
}

/**
 * gRPC verification result.
 */
export interface GrpcVerificationResult {
  /** Whether verification succeeded */
  ok: boolean;
  /** gRPC status code */
  status: GrpcStatusCode;
  /** Error if verification failed */
  error?: GrpcError;
  /** Receipt ID if verification succeeded */
  receiptId?: string;
}

/**
 * Create a successful verification result.
 */
export function createSuccessResult(receiptId?: string): GrpcVerificationResult {
  return {
    ok: true,
    status: GrpcStatus.OK,
    receiptId,
  };
}

/**
 * Create a failed verification result.
 */
export function createFailureResult(error: GrpcError): GrpcVerificationResult {
  return {
    ok: false,
    status: error.code,
    error,
  };
}

/**
 * Status code name mapping for debugging.
 */
export const GrpcStatusName: Record<GrpcStatusCode, string> = {
  [GrpcStatus.OK]: 'OK',
  [GrpcStatus.CANCELLED]: 'CANCELLED',
  [GrpcStatus.UNKNOWN]: 'UNKNOWN',
  [GrpcStatus.INVALID_ARGUMENT]: 'INVALID_ARGUMENT',
  [GrpcStatus.DEADLINE_EXCEEDED]: 'DEADLINE_EXCEEDED',
  [GrpcStatus.NOT_FOUND]: 'NOT_FOUND',
  [GrpcStatus.ALREADY_EXISTS]: 'ALREADY_EXISTS',
  [GrpcStatus.PERMISSION_DENIED]: 'PERMISSION_DENIED',
  [GrpcStatus.RESOURCE_EXHAUSTED]: 'RESOURCE_EXHAUSTED',
  [GrpcStatus.FAILED_PRECONDITION]: 'FAILED_PRECONDITION',
  [GrpcStatus.ABORTED]: 'ABORTED',
  [GrpcStatus.OUT_OF_RANGE]: 'OUT_OF_RANGE',
  [GrpcStatus.UNIMPLEMENTED]: 'UNIMPLEMENTED',
  [GrpcStatus.INTERNAL]: 'INTERNAL',
  [GrpcStatus.UNAVAILABLE]: 'UNAVAILABLE',
  [GrpcStatus.DATA_LOSS]: 'DATA_LOSS',
  [GrpcStatus.UNAUTHENTICATED]: 'UNAUTHENTICATED',
};

/**
 * Get human-readable name for a gRPC status code.
 */
export function getStatusName(code: GrpcStatusCode): string {
  return GrpcStatusName[code] ?? 'UNKNOWN';
}
