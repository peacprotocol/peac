/**
 * HTTP Signature error codes per execution pack specification.
 */

export const ErrorCodes = {
  /** Signature-Input header parse failed */
  SIGNATURE_INPUT_MALFORMED: 'E_SIGNATURE_INPUT_MALFORMED',
  /** No Signature header present */
  SIGNATURE_MISSING: 'E_SIGNATURE_MISSING',
  /** Required param (created/keyid/alg) missing */
  SIGNATURE_PARAM_MISSING: 'E_SIGNATURE_PARAM_MISSING',
  /** Algorithm not ed25519 */
  SIGNATURE_ALGORITHM_UNSUPPORTED: 'E_SIGNATURE_ALGORITHM_UNSUPPORTED',
  /** Signature expired (now > expires) */
  SIGNATURE_EXPIRED: 'E_SIGNATURE_EXPIRED',
  /** Signature from future (created > now + skew) */
  SIGNATURE_FUTURE: 'E_SIGNATURE_FUTURE',
  /** Cryptographic verification failed */
  SIGNATURE_INVALID: 'E_SIGNATURE_INVALID',
  /** Ed25519 WebCrypto not supported */
  WEBCRYPTO_UNAVAILABLE: 'E_WEBCRYPTO_UNAVAILABLE',
  /** Key not found by resolver */
  KEY_NOT_FOUND: 'E_KEY_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for each error.
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCodes.SIGNATURE_INPUT_MALFORMED]: 400,
  [ErrorCodes.SIGNATURE_MISSING]: 401,
  [ErrorCodes.SIGNATURE_PARAM_MISSING]: 400,
  [ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED]: 400,
  [ErrorCodes.SIGNATURE_EXPIRED]: 401,
  [ErrorCodes.SIGNATURE_FUTURE]: 401,
  [ErrorCodes.SIGNATURE_INVALID]: 401,
  [ErrorCodes.WEBCRYPTO_UNAVAILABLE]: 500,
  [ErrorCodes.KEY_NOT_FOUND]: 401,
};

/**
 * HTTP Signature error with code and HTTP status.
 */
export class HttpSignatureError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpSignatureError';
    this.code = code;
    this.httpStatus = ErrorHttpStatus[code];
  }
}
