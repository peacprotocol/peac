/**
 * Typed errors for @peac/crypto
 *
 * These error codes are INTERNAL to @peac/crypto and should NOT be exposed
 * as protocol-stable API. Higher-level packages (like @peac/protocol) should
 * map these to canonical E_* codes from specs/kernel/errors.json.
 *
 * The CRYPTO_ prefix makes it clear these are package-internal codes.
 */

/**
 * Internal error codes for crypto operations
 *
 * These are NOT canonical protocol error codes. They are internal to @peac/crypto.
 * @peac/protocol maps these to canonical E_* codes (E_INVALID_FORMAT, etc).
 */
export type CryptoErrorCode =
  | 'CRYPTO_INVALID_KEY_LENGTH'
  | 'CRYPTO_INVALID_JWS_FORMAT'
  | 'CRYPTO_INVALID_TYP'
  | 'CRYPTO_INVALID_ALG'
  | 'CRYPTO_INVALID_SIGNATURE';

/**
 * Typed error for crypto operations
 *
 * Use `err.code` to handle errors programmatically without message parsing.
 * The code is a CRYPTO_* internal code, not a canonical E_* protocol code.
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CryptoError.prototype);
  }
}

/**
 * Check if a CryptoError code indicates a format/structure issue
 * (as opposed to a cryptographic verification failure)
 *
 * @internal This is an internal helper, not part of the public API.
 * Use structural checks on CryptoError.code instead of relying on this function.
 */
export function isFormatError(code: CryptoErrorCode): boolean {
  return (
    code === 'CRYPTO_INVALID_JWS_FORMAT' ||
    code === 'CRYPTO_INVALID_TYP' ||
    code === 'CRYPTO_INVALID_ALG' ||
    code === 'CRYPTO_INVALID_KEY_LENGTH'
  );
}
