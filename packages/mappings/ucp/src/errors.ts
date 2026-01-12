/**
 * @peac/mappings-ucp - Error codes
 *
 * UCP webhook verification and mapping error codes.
 * Follows E_UCP_* naming convention.
 */

/**
 * UCP error codes.
 */
export const ErrorCodes = {
  // Signature verification errors (400 - malformed)
  SIGNATURE_MISSING: 'E_UCP_SIGNATURE_MISSING',
  SIGNATURE_MALFORMED: 'E_UCP_SIGNATURE_MALFORMED',
  SIGNATURE_ALGORITHM_UNSUPPORTED: 'E_UCP_SIGNATURE_ALGORITHM_UNSUPPORTED',
  SIGNATURE_B64_INVALID: 'E_UCP_SIGNATURE_B64_INVALID',

  // Key errors (401 - auth failure)
  KEY_NOT_FOUND: 'E_UCP_KEY_NOT_FOUND',
  KEY_ALGORITHM_MISMATCH: 'E_UCP_KEY_ALGORITHM_MISMATCH',
  KEY_CURVE_MISMATCH: 'E_UCP_KEY_CURVE_MISMATCH',

  // Verification errors (401 - auth failure)
  SIGNATURE_INVALID: 'E_UCP_SIGNATURE_INVALID',
  VERIFICATION_FAILED: 'E_UCP_VERIFICATION_FAILED',

  // Profile errors (502 - upstream failure)
  PROFILE_FETCH_FAILED: 'E_UCP_PROFILE_FETCH_FAILED',
  PROFILE_INVALID: 'E_UCP_PROFILE_INVALID',
  PROFILE_NO_SIGNING_KEYS: 'E_UCP_PROFILE_NO_SIGNING_KEYS',

  // Payload errors (400 - malformed)
  PAYLOAD_EMPTY: 'E_UCP_PAYLOAD_EMPTY',
  PAYLOAD_NOT_JSON: 'E_UCP_PAYLOAD_NOT_JSON',
  PAYLOAD_TOO_LARGE: 'E_UCP_PAYLOAD_TOO_LARGE',

  // Mapping errors (400 - malformed)
  ORDER_INVALID: 'E_UCP_ORDER_INVALID',
  ORDER_MISSING_ID: 'E_UCP_ORDER_MISSING_ID',
  ORDER_MISSING_LINE_ITEMS: 'E_UCP_ORDER_MISSING_LINE_ITEMS',
  ORDER_MISSING_TOTALS: 'E_UCP_ORDER_MISSING_TOTALS',

  // Evidence errors (500 - internal)
  EVIDENCE_SERIALIZATION_FAILED: 'E_UCP_EVIDENCE_SERIALIZATION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for each error.
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  // 400 - Bad Request (malformed)
  [ErrorCodes.SIGNATURE_MISSING]: 400,
  [ErrorCodes.SIGNATURE_MALFORMED]: 400,
  [ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED]: 400,
  [ErrorCodes.SIGNATURE_B64_INVALID]: 400,
  [ErrorCodes.PAYLOAD_EMPTY]: 400,
  [ErrorCodes.PAYLOAD_NOT_JSON]: 400,
  [ErrorCodes.PAYLOAD_TOO_LARGE]: 400,
  [ErrorCodes.ORDER_INVALID]: 400,
  [ErrorCodes.ORDER_MISSING_ID]: 400,
  [ErrorCodes.ORDER_MISSING_LINE_ITEMS]: 400,
  [ErrorCodes.ORDER_MISSING_TOTALS]: 400,

  // 401 - Unauthorized (auth failure)
  [ErrorCodes.KEY_NOT_FOUND]: 401,
  [ErrorCodes.KEY_ALGORITHM_MISMATCH]: 401,
  [ErrorCodes.KEY_CURVE_MISMATCH]: 401,
  [ErrorCodes.SIGNATURE_INVALID]: 401,
  [ErrorCodes.VERIFICATION_FAILED]: 401,

  // 500 - Internal Server Error
  [ErrorCodes.EVIDENCE_SERIALIZATION_FAILED]: 500,

  // 502 - Bad Gateway (upstream failure)
  [ErrorCodes.PROFILE_FETCH_FAILED]: 502,
  [ErrorCodes.PROFILE_INVALID]: 502,
  [ErrorCodes.PROFILE_NO_SIGNING_KEYS]: 502,
};

/**
 * UCP-specific error class.
 */
export class UcpError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'UcpError';
    this.code = code;
    this.httpStatus = ErrorHttpStatus[code];
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Create a UCP error with standard format.
 */
export function ucpError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): UcpError {
  return new UcpError(code, message, details);
}
