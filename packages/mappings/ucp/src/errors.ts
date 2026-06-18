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

  // RFC 9421 HTTP Message Signature errors (400 - malformed)
  HTTP_SIGNATURE_INPUT_MISSING: 'E_UCP_HTTP_SIGNATURE_INPUT_MISSING',
  HTTP_SIGNATURE_MISSING: 'E_UCP_HTTP_SIGNATURE_MISSING',
  HTTP_SIGNATURE_MALFORMED: 'E_UCP_HTTP_SIGNATURE_MALFORMED',
  HTTP_SIGNATURE_COMPONENT_MISSING: 'E_UCP_HTTP_SIGNATURE_COMPONENT_MISSING',

  // RFC 9530 Content-Digest errors (all 400: malformed request / integrity)
  CONTENT_DIGEST_MISSING: 'E_UCP_CONTENT_DIGEST_MISSING',
  CONTENT_DIGEST_MALFORMED: 'E_UCP_CONTENT_DIGEST_MALFORMED',
  CONTENT_DIGEST_UNSUPPORTED: 'E_UCP_CONTENT_DIGEST_UNSUPPORTED',
  CONTENT_DIGEST_MISMATCH: 'E_UCP_CONTENT_DIGEST_MISMATCH',

  // Body required to verify a digest-covered request (400 - malformed)
  BODY_REQUIRED: 'E_UCP_BODY_REQUIRED',

  // Signer identity binding (401 - auth failure)
  AGENT_MISMATCH: 'E_UCP_AGENT_MISMATCH',

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
  // UCP maps a malformed/incomplete signed request to 400.
  [ErrorCodes.HTTP_SIGNATURE_MALFORMED]: 400,
  [ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING]: 400,
  [ErrorCodes.CONTENT_DIGEST_MISSING]: 400,
  [ErrorCodes.CONTENT_DIGEST_MALFORMED]: 400,
  [ErrorCodes.CONTENT_DIGEST_UNSUPPORTED]: 400,
  // UCP: digest_mismatch is a request-integrity (400) error, not 401.
  [ErrorCodes.CONTENT_DIGEST_MISMATCH]: 400,
  [ErrorCodes.BODY_REQUIRED]: 400,
  [ErrorCodes.PAYLOAD_EMPTY]: 400,
  [ErrorCodes.PAYLOAD_NOT_JSON]: 400,
  [ErrorCodes.PAYLOAD_TOO_LARGE]: 400,
  [ErrorCodes.ORDER_INVALID]: 400,
  [ErrorCodes.ORDER_MISSING_ID]: 400,
  [ErrorCodes.ORDER_MISSING_LINE_ITEMS]: 400,
  [ErrorCodes.ORDER_MISSING_TOTALS]: 400,

  // 401 - Unauthorized (auth failure)
  // UCP maps signature_missing to 401 (missing credentials), so the RFC 9421
  // missing-header codes are 401, not 400.
  [ErrorCodes.HTTP_SIGNATURE_INPUT_MISSING]: 401,
  [ErrorCodes.HTTP_SIGNATURE_MISSING]: 401,
  [ErrorCodes.KEY_NOT_FOUND]: 401,
  [ErrorCodes.KEY_ALGORITHM_MISMATCH]: 401,
  [ErrorCodes.KEY_CURVE_MISMATCH]: 401,
  [ErrorCodes.SIGNATURE_INVALID]: 401,
  [ErrorCodes.VERIFICATION_FAILED]: 401,
  [ErrorCodes.AGENT_MISMATCH]: 401,

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
