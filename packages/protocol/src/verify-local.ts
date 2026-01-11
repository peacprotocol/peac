/**
 * Local receipt verification with schema validation
 *
 * Use this for verifying receipts when you have the public key locally,
 * without JWKS discovery.
 */

import { verify as jwsVerify } from '@peac/crypto';
import { ReceiptClaimsSchema, type ReceiptClaimsType } from '@peac/schema';

/**
 * Structural type for CryptoError
 * Used instead of instanceof for robustness across ESM/CJS boundaries
 */
interface CryptoErrorLike {
  name: 'CryptoError';
  code: string;
  message: string;
}

/**
 * Structural check for CryptoError
 * More robust than instanceof across module boundaries (ESM/CJS, duplicate packages)
 */
function isCryptoError(err: unknown): err is CryptoErrorLike {
  return (
    err !== null &&
    typeof err === 'object' &&
    'name' in err &&
    err.name === 'CryptoError' &&
    'code' in err &&
    typeof err.code === 'string' &&
    err.code.startsWith('CRYPTO_') &&
    'message' in err &&
    typeof err.message === 'string'
  );
}

/**
 * Canonical error codes for local verification
 *
 * These map to E_* codes in specs/kernel/errors.json
 */
export type VerifyLocalErrorCode =
  | 'E_INVALID_SIGNATURE'
  | 'E_INVALID_FORMAT'
  | 'E_EXPIRED'
  | 'E_NOT_YET_VALID'
  | 'E_INVALID_ISSUER'
  | 'E_INVALID_AUDIENCE'
  | 'E_INVALID_SUBJECT'
  | 'E_INVALID_RECEIPT_ID'
  | 'E_MISSING_EXP'
  | 'E_INTERNAL';

/**
 * Options for local verification
 */
export interface VerifyLocalOptions {
  /**
   * Expected issuer URL
   *
   * If provided, verification fails if receipt.iss does not match.
   */
  issuer?: string;

  /**
   * Expected audience URL
   *
   * If provided, verification fails if receipt.aud does not match.
   */
  audience?: string;

  /**
   * Expected subject URI
   *
   * If provided, verification fails if receipt.subject.uri does not match.
   * Binds the receipt to a specific resource/interaction target.
   */
  subjectUri?: string;

  /**
   * Expected receipt ID (rid)
   *
   * If provided, verification fails if receipt.rid does not match.
   * Useful for idempotency checks or correlating with prior receipts.
   */
  rid?: string;

  /**
   * Require expiration claim
   *
   * If true, receipts without exp claim are rejected.
   * Defaults to false.
   */
  requireExp?: boolean;

  /**
   * Current timestamp (Unix seconds)
   *
   * Defaults to Date.now() / 1000. Override for testing.
   */
  now?: number;

  /**
   * Maximum clock skew tolerance (seconds)
   *
   * Allows for clock drift between issuer and verifier.
   * Defaults to 300 (5 minutes).
   */
  maxClockSkew?: number;
}

/**
 * Result of successful local verification
 */
export interface VerifyLocalSuccess {
  /** Verification succeeded */
  valid: true;

  /** Validated receipt claims (schema-derived type) */
  claims: ReceiptClaimsType;

  /** Key ID from JWS header (for logging/indexing) */
  kid: string;
}

/**
 * Result of failed local verification
 */
export interface VerifyLocalFailure {
  /** Verification failed */
  valid: false;

  /** Canonical error code (maps to specs/kernel/errors.json) */
  code: VerifyLocalErrorCode;

  /** Human-readable error message */
  message: string;
}

/**
 * Union type for local verification result
 */
export type VerifyLocalResult = VerifyLocalSuccess | VerifyLocalFailure;

/**
 * Crypto error codes that indicate format/validation issues
 * These are CRYPTO_* internal codes from @peac/crypto, mapped to canonical E_* codes
 */
const FORMAT_ERROR_CODES = new Set([
  'CRYPTO_INVALID_JWS_FORMAT',
  'CRYPTO_INVALID_TYP',
  'CRYPTO_INVALID_ALG',
  'CRYPTO_INVALID_KEY_LENGTH',
]);

/**
 * Verify a PEAC receipt locally with a known public key
 *
 * This function:
 * 1. Verifies the Ed25519 signature and header (typ, alg)
 * 2. Validates the receipt schema with Zod
 * 3. Checks issuer/audience/subject binding (if options provided)
 * 4. Checks time validity (exp/iat with clock skew tolerance)
 *
 * Use this when you have the issuer's public key and don't need JWKS discovery.
 * For JWKS-based verification, use `verifyReceipt()` instead.
 *
 * @param jws - JWS compact serialization
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param options - Optional verification options (issuer, audience, subject, clock skew)
 * @returns Typed verification result
 *
 * @example
 * ```typescript
 * const result = await verifyLocal(jws, publicKey, {
 *   issuer: 'https://api.example.com',
 *   audience: 'https://client.example.com',
 *   subjectUri: 'https://api.example.com/inference/v1',
 * });
 * if (result.valid) {
 *   console.log('Issuer:', result.claims.iss);
 *   console.log('Amount:', result.claims.amt, result.claims.cur);
 *   console.log('Key ID:', result.kid);
 * } else {
 *   console.error('Verification failed:', result.code, result.message);
 * }
 * ```
 */
export async function verifyLocal(
  jws: string,
  publicKey: Uint8Array,
  options: VerifyLocalOptions = {}
): Promise<VerifyLocalResult> {
  const { issuer, audience, subjectUri, rid, requireExp = false, maxClockSkew = 300 } = options;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  try {
    // 1. Verify signature and header (typ, alg validated by @peac/crypto)
    const result = await jwsVerify<unknown>(jws, publicKey);

    if (!result.valid) {
      return {
        valid: false,
        code: 'E_INVALID_SIGNATURE',
        message: 'Ed25519 signature verification failed',
      };
    }

    // 2. Validate schema
    const parseResult = ReceiptClaimsSchema.safeParse(result.payload);

    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return {
        valid: false,
        code: 'E_INVALID_FORMAT',
        message: `Receipt schema validation failed: ${firstIssue?.message ?? 'unknown error'}`,
      };
    }

    const claims = parseResult.data;

    // 3. Check issuer binding
    if (issuer !== undefined && claims.iss !== issuer) {
      return {
        valid: false,
        code: 'E_INVALID_ISSUER',
        message: `Issuer mismatch: expected "${issuer}", got "${claims.iss}"`,
      };
    }

    // 4. Check audience binding
    if (audience !== undefined && claims.aud !== audience) {
      return {
        valid: false,
        code: 'E_INVALID_AUDIENCE',
        message: `Audience mismatch: expected "${audience}", got "${claims.aud}"`,
      };
    }

    // 5. Check subject binding
    if (subjectUri !== undefined) {
      const actualSubjectUri = claims.subject?.uri;
      if (actualSubjectUri !== subjectUri) {
        return {
          valid: false,
          code: 'E_INVALID_SUBJECT',
          message: `Subject mismatch: expected "${subjectUri}", got "${actualSubjectUri ?? 'undefined'}"`,
        };
      }
    }

    // 6. Check receipt ID binding
    if (rid !== undefined && claims.rid !== rid) {
      return {
        valid: false,
        code: 'E_INVALID_RECEIPT_ID',
        message: `Receipt ID mismatch: expected "${rid}", got "${claims.rid}"`,
      };
    }

    // 7. Check requireExp
    if (requireExp && claims.exp === undefined) {
      return {
        valid: false,
        code: 'E_MISSING_EXP',
        message: 'Receipt missing required exp claim',
      };
    }

    // 8. Check not-yet-valid (iat with clock skew)
    if (claims.iat > now + maxClockSkew) {
      return {
        valid: false,
        code: 'E_NOT_YET_VALID',
        message: `Receipt not yet valid: issued at ${new Date(claims.iat * 1000).toISOString()}, now is ${new Date(now * 1000).toISOString()}`,
      };
    }

    // 9. Check expiry (with clock skew tolerance)
    if (claims.exp !== undefined && claims.exp < now - maxClockSkew) {
      return {
        valid: false,
        code: 'E_EXPIRED',
        message: `Receipt expired at ${new Date(claims.exp * 1000).toISOString()}`,
      };
    }

    return {
      valid: true,
      claims,
      kid: result.header.kid,
    };
  } catch (err) {
    // Handle typed CryptoError from @peac/crypto
    // Use structural check instead of instanceof for robustness across ESM/CJS boundaries
    // Map internal CRYPTO_* codes to canonical E_* codes
    if (isCryptoError(err)) {
      if (FORMAT_ERROR_CODES.has(err.code)) {
        return {
          valid: false,
          code: 'E_INVALID_FORMAT',
          message: err.message,
        };
      }
      if (err.code === 'CRYPTO_INVALID_SIGNATURE') {
        return {
          valid: false,
          code: 'E_INVALID_SIGNATURE',
          message: err.message,
        };
      }
    }

    // All other errors (JSON parse, unexpected) -> E_INTERNAL
    // No message parsing - code-based mapping only
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      code: 'E_INTERNAL',
      message: `Unexpected verification error: ${message}`,
    };
  }
}
