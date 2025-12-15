/**
 * JWKS Cache error codes per execution pack specification.
 */

export const ErrorCodes = {
  /** Network error fetching JWKS */
  JWKS_FETCH_FAILED: 'E_JWKS_FETCH_FAILED',
  /** Fetch timeout */
  JWKS_TIMEOUT: 'E_JWKS_TIMEOUT',
  /** Invalid JSON or structure */
  JWKS_INVALID: 'E_JWKS_INVALID',
  /** Response > 1MB */
  JWKS_TOO_LARGE: 'E_JWKS_TOO_LARGE',
  /** keys.length > 100 */
  JWKS_TOO_MANY_KEYS: 'E_JWKS_TOO_MANY_KEYS',
  /** Private IP or metadata URL blocked */
  SSRF_BLOCKED: 'E_SSRF_BLOCKED',
  /** Requested kid not in JWKS */
  KEY_NOT_FOUND: 'E_KEY_NOT_FOUND',
  /** All discovery paths failed */
  ALL_PATHS_FAILED: 'E_ALL_PATHS_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for each error.
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCodes.JWKS_FETCH_FAILED]: 502,
  [ErrorCodes.JWKS_TIMEOUT]: 504,
  [ErrorCodes.JWKS_INVALID]: 502,
  [ErrorCodes.JWKS_TOO_LARGE]: 502,
  [ErrorCodes.JWKS_TOO_MANY_KEYS]: 502,
  [ErrorCodes.SSRF_BLOCKED]: 403,
  [ErrorCodes.KEY_NOT_FOUND]: 401,
  [ErrorCodes.ALL_PATHS_FAILED]: 502,
};

/**
 * JWKS error with code and HTTP status.
 */
export class JwksError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'JwksError';
    this.code = code;
    this.httpStatus = ErrorHttpStatus[code];
  }
}
