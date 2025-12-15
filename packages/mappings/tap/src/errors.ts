/**
 * TAP-specific error codes.
 *
 * These are in addition to the generic http-signatures errors.
 */

export const ErrorCodes = {
  /** expires - created > 480 seconds */
  TAP_WINDOW_TOO_LARGE: 'E_TAP_WINDOW_TOO_LARGE',
  /** created > now OR now > expires */
  TAP_TIME_INVALID: 'E_TAP_TIME_INVALID',
  /** alg is not ed25519 */
  TAP_ALGORITHM_INVALID: 'E_TAP_ALGORITHM_INVALID',
  /** Unknown tag (rejected unless allowUnknownTags) */
  TAP_TAG_UNKNOWN: 'E_TAP_TAG_UNKNOWN',
  /** Signature verification failed */
  TAP_SIGNATURE_INVALID: 'E_TAP_SIGNATURE_INVALID',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for TAP errors.
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCodes.TAP_WINDOW_TOO_LARGE]: 400,
  [ErrorCodes.TAP_TIME_INVALID]: 401,
  [ErrorCodes.TAP_ALGORITHM_INVALID]: 400,
  [ErrorCodes.TAP_TAG_UNKNOWN]: 400,
  [ErrorCodes.TAP_SIGNATURE_INVALID]: 401,
};

/**
 * TAP error with code and HTTP status.
 */
export class TapError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'TapError';
    this.code = code;
    this.httpStatus = ErrorHttpStatus[code];
  }
}
