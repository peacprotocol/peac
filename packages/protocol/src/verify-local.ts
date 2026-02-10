/**
 * Local receipt verification with schema validation
 *
 * Use this for verifying receipts when you have the public key locally,
 * without JWKS discovery.
 */

import { verify as jwsVerify } from '@peac/crypto';
import {
  parseReceiptClaims,
  type ReceiptClaimsType,
  type AttestationReceiptClaims,
} from '@peac/schema';
import type { PolicyBindingStatus } from './verifier-types';

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
 *
 * Discriminated union on `variant` -- callers narrow claims type via variant check:
 *   if (result.valid && result.variant === 'commerce') { result.claims.amt }
 */
export type VerifyLocalSuccess =
  | {
      /** Verification succeeded */
      valid: true;
      /** Receipt variant (commerce = payment receipt, attestation = non-payment) */
      variant: 'commerce';
      /** Validated commerce receipt claims */
      claims: ReceiptClaimsType;
      /** Key ID from JWS header (for logging/indexing) */
      kid: string;
      /**
       * Policy binding status (DD-49).
       *
       * Always 'unavailable' for Wire 0.1 receipts (no policy digest on wire).
       * Wire 0.2 receipts with `peac.policy.digest` will report 'verified' or 'failed'.
       */
      policy_binding: PolicyBindingStatus;
    }
  | {
      /** Verification succeeded */
      valid: true;
      /** Receipt variant (commerce = payment receipt, attestation = non-payment) */
      variant: 'attestation';
      /** Validated attestation receipt claims */
      claims: AttestationReceiptClaims;
      /** Key ID from JWS header (for logging/indexing) */
      kid: string;
      /**
       * Policy binding status (DD-49).
       *
       * Always 'unavailable' for Wire 0.1 receipts (no policy digest on wire).
       * Wire 0.2 receipts with `peac.policy.digest` will report 'verified' or 'failed'.
       */
      policy_binding: PolicyBindingStatus;
    };

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

  /** Structured details for debugging (stable error code preserved in `code`) */
  details?: {
    /** Precise parse error code from unified parser (e.g. E_PARSE_COMMERCE_INVALID) */
    parse_code?: string;
    /** Zod validation issues (bounded, stable shape -- non-normative, may change) */
    issues?: ReadonlyArray<{ path: string; message: string }>;
  };
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

/** Max parse issues to include in details (prevents log bloat) */
const MAX_PARSE_ISSUES = 25;

/**
 * Sanitize Zod issues into a bounded, stable structure.
 * Avoids exposing raw Zod internals or unbounded arrays in the public API.
 */
function sanitizeParseIssues(
  issues: unknown
): ReadonlyArray<{ path: string; message: string }> | undefined {
  if (!Array.isArray(issues)) return undefined;
  return issues.slice(0, MAX_PARSE_ISSUES).map((issue) => ({
    path: Array.isArray(issue?.path) ? issue.path.join('.') : '',
    message: typeof issue?.message === 'string' ? issue.message : String(issue),
  }));
}

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

    // 2. Validate schema (unified parser supports both commerce and attestation)
    const pr = parseReceiptClaims(result.payload);

    if (!pr.ok) {
      return {
        valid: false,
        code: 'E_INVALID_FORMAT',
        message: `Receipt schema validation failed: ${pr.error.message}`,
        details: { parse_code: pr.error.code, issues: sanitizeParseIssues(pr.error.issues) },
      };
    }

    // Shared binding checks (iss, aud, rid, iat, exp exist on both receipt types)
    // 3. Check issuer binding
    if (issuer !== undefined && pr.claims.iss !== issuer) {
      return {
        valid: false,
        code: 'E_INVALID_ISSUER',
        message: `Issuer mismatch: expected "${issuer}", got "${pr.claims.iss}"`,
      };
    }

    // 4. Check audience binding
    if (audience !== undefined && pr.claims.aud !== audience) {
      return {
        valid: false,
        code: 'E_INVALID_AUDIENCE',
        message: `Audience mismatch: expected "${audience}", got "${pr.claims.aud}"`,
      };
    }

    // 5. Check receipt ID binding
    if (rid !== undefined && pr.claims.rid !== rid) {
      return {
        valid: false,
        code: 'E_INVALID_RECEIPT_ID',
        message: `Receipt ID mismatch: expected "${rid}", got "${pr.claims.rid}"`,
      };
    }

    // 6. Check requireExp
    if (requireExp && pr.claims.exp === undefined) {
      return {
        valid: false,
        code: 'E_MISSING_EXP',
        message: 'Receipt missing required exp claim',
      };
    }

    // 7. Check not-yet-valid (iat with clock skew)
    if (pr.claims.iat > now + maxClockSkew) {
      return {
        valid: false,
        code: 'E_NOT_YET_VALID',
        message: `Receipt not yet valid: issued at ${new Date(pr.claims.iat * 1000).toISOString()}, now is ${new Date(now * 1000).toISOString()}`,
      };
    }

    // 8. Check expiry (with clock skew tolerance)
    if (pr.claims.exp !== undefined && pr.claims.exp < now - maxClockSkew) {
      return {
        valid: false,
        code: 'E_EXPIRED',
        message: `Receipt expired at ${new Date(pr.claims.exp * 1000).toISOString()}`,
      };
    }

    // 9. Subject binding + typed return (variant-branched, no unsafe casts)
    if (pr.variant === 'commerce') {
      const claims = pr.claims as ReceiptClaimsType;
      if (subjectUri !== undefined && claims.subject?.uri !== subjectUri) {
        return {
          valid: false,
          code: 'E_INVALID_SUBJECT',
          message: `Subject mismatch: expected "${subjectUri}", got "${claims.subject?.uri ?? 'undefined'}"`,
        };
      }
      // Wire 0.1: no policy digest on wire, always 'unavailable' (DD-49)
      return {
        valid: true,
        variant: 'commerce',
        claims,
        kid: result.header.kid,
        policy_binding: 'unavailable',
      };
    } else {
      const claims = pr.claims as AttestationReceiptClaims;
      if (subjectUri !== undefined && claims.sub !== subjectUri) {
        return {
          valid: false,
          code: 'E_INVALID_SUBJECT',
          message: `Subject mismatch: expected "${subjectUri}", got "${claims.sub ?? 'undefined'}"`,
        };
      }
      // Wire 0.1: no policy digest on wire, always 'unavailable' (DD-49)
      return {
        valid: true,
        variant: 'attestation',
        claims,
        kid: result.header.kid,
        policy_binding: 'unavailable',
      };
    }
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

    // Handle JSON parse errors from malformed payloads
    // Use structural check for cross-boundary robustness (consistent with isCryptoError pattern)
    if (
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: unknown }).name === 'SyntaxError'
    ) {
      const syntaxMessage =
        'message' in err && typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Invalid JSON';
      return {
        valid: false,
        code: 'E_INVALID_FORMAT',
        message: `Invalid receipt payload: ${syntaxMessage}`,
      };
    }

    // All other errors -> E_INTERNAL
    // No message parsing - code-based mapping only
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      code: 'E_INTERNAL',
      message: `Unexpected verification error: ${message}`,
    };
  }
}

/**
 * Type guard: narrows a VerifyLocalResult to a commerce success.
 *
 * Use instead of manual `result.valid && result.variant === 'commerce'` checks
 * to get proper claims narrowing to ReceiptClaimsType.
 */
export function isCommerceResult(
  r: VerifyLocalResult
): r is VerifyLocalSuccess & { variant: 'commerce' } {
  return r.valid === true && r.variant === 'commerce';
}

/**
 * Type guard: narrows a VerifyLocalResult to an attestation success.
 *
 * Use instead of manual `result.valid && result.variant === 'attestation'` checks
 * to get proper claims narrowing to AttestationReceiptClaims.
 */
export function isAttestationResult(
  r: VerifyLocalResult
): r is VerifyLocalSuccess & { variant: 'attestation' } {
  return r.valid === true && r.variant === 'attestation';
}
