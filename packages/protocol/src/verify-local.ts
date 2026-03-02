/**
 * Local receipt verification with schema validation
 *
 * Use this for verifying receipts when you have the public key locally,
 * without JWKS discovery.
 */

import { verify as jwsVerify } from '@peac/crypto';
import { type VerificationStrictness, type VerificationWarning } from '@peac/kernel';
import {
  parseReceiptClaims,
  validateKernelConstraints,
  type ReceiptClaimsType,
  type AttestationReceiptClaims,
  type Wire02Claims,
  checkOccurredAtSkew,
  sortWarnings,
  WARNING_TYP_MISSING,
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
  | 'E_CONSTRAINT_VIOLATION'
  | 'E_EXPIRED'
  | 'E_NOT_YET_VALID'
  | 'E_INVALID_ISSUER'
  | 'E_INVALID_AUDIENCE'
  | 'E_INVALID_SUBJECT'
  | 'E_INVALID_RECEIPT_ID'
  | 'E_MISSING_EXP'
  | 'E_WIRE_VERSION_MISMATCH'
  | 'E_UNSUPPORTED_WIRE_VERSION'
  | 'E_OCCURRED_AT_FUTURE'
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

  /**
   * Verification strictness profile (v0.12.0-preview.1, DD-156).
   *
   * - 'strict' (default): missing typ is a hard error before schema validation.
   * - 'interop': missing typ emits a 'typ_missing' warning and routes by payload content.
   *
   * Strictness is EXCLUSIVELY controlled here (@peac/protocol). @peac/crypto has no strictness param.
   */
  strictness?: VerificationStrictness;
}

/**
 * Result of successful local verification
 *
 * Discriminated union on `variant` -- callers narrow claims type via variant check:
 *   if (result.valid && result.variant === 'commerce') { result.claims.amt }
 *   if (result.valid && result.variant === 'wire-02') { result.claims.kind }
 */
export type VerifyLocalSuccess =
  | {
      /** Verification succeeded */
      valid: true;
      /** Receipt variant (commerce = payment receipt) */
      variant: 'commerce';
      /** Validated commerce receipt claims */
      claims: ReceiptClaimsType;
      /** Key ID from JWS header (for logging/indexing) */
      kid: string;
      /** Wire format version */
      wireVersion: '0.1';
      /** Verification warnings (always empty for Wire 0.1) */
      warnings: VerificationWarning[];
      /**
       * Policy binding status (DD-49).
       *
       * Always 'unavailable' for Wire 0.1 receipts (no policy digest on wire).
       */
      policy_binding: PolicyBindingStatus;
    }
  | {
      /** Verification succeeded */
      valid: true;
      /** Receipt variant (attestation = non-payment) */
      variant: 'attestation';
      /** Validated attestation receipt claims */
      claims: AttestationReceiptClaims;
      /** Key ID from JWS header (for logging/indexing) */
      kid: string;
      /** Wire format version */
      wireVersion: '0.1';
      /** Verification warnings (always empty for Wire 0.1) */
      warnings: VerificationWarning[];
      /**
       * Policy binding status (DD-49).
       *
       * Always 'unavailable' for Wire 0.1 receipts.
       */
      policy_binding: PolicyBindingStatus;
    }
  | {
      /** Verification succeeded */
      valid: true;
      /** Receipt variant (wire-02 = Wire 0.2 evidence or challenge) */
      variant: 'wire-02';
      /** Validated Wire 0.2 receipt claims */
      claims: Wire02Claims;
      /** Key ID from JWS header (for logging/indexing) */
      kid: string;
      /** Wire format version */
      wireVersion: '0.2';
      /** Verification warnings from schema parsing and strictness routing */
      warnings: VerificationWarning[];
      /**
       * Policy binding status (DD-49).
       *
       * 'unavailable' until PR 14 (Policy Binding) adds full JCS+SHA-256 check.
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
 * These are CRYPTO_* internal codes from @peac/crypto, mapped to canonical E_* codes.
 * Includes Wire 0.2 JOSE hardening codes (v0.12.0-preview.1, DD-156).
 */
const FORMAT_ERROR_CODES = new Set([
  'CRYPTO_INVALID_JWS_FORMAT',
  'CRYPTO_INVALID_TYP',
  'CRYPTO_INVALID_ALG',
  'CRYPTO_INVALID_KEY_LENGTH',
  // Wire 0.2 JOSE hardening
  'CRYPTO_JWS_EMBEDDED_KEY',
  'CRYPTO_JWS_CRIT_REJECTED',
  'CRYPTO_JWS_MISSING_KID',
  'CRYPTO_JWS_B64_REJECTED',
  'CRYPTO_JWS_ZIP_REJECTED',
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
 * 2. Applies strictness routing for missing typ (strict: hard error; interop: warning)
 * 3. Validates the receipt schema with Zod (Wire 0.1 or Wire 0.2)
 * 4. Checks issuer/audience/subject binding (if options provided)
 * 5. Checks time validity (exp/iat with clock skew tolerance)
 * 6. For Wire 0.2: checks occurred_at skew and collects parse warnings
 *
 * Use this when you have the issuer's public key and don't need JWKS discovery.
 * For JWKS-based verification, use `verifyReceipt()` instead.
 *
 * @param jws - JWS compact serialization
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param options - Optional verification options (issuer, audience, subject, clock skew, strictness)
 * @returns Typed verification result
 *
 * @example
 * ```typescript
 * const result = await verifyLocal(jws, publicKey, {
 *   issuer: 'https://api.example.com',
 *   strictness: 'strict',
 * });
 * if (result.valid && result.variant === 'wire-02') {
 *   console.log('Kind:', result.claims.kind);
 *   console.log('Warnings:', result.warnings);
 * }
 * ```
 */
export async function verifyLocal(
  jws: string,
  publicKey: Uint8Array,
  options: VerifyLocalOptions = {}
): Promise<VerifyLocalResult> {
  const {
    issuer,
    audience,
    subjectUri,
    rid,
    requireExp = false,
    maxClockSkew = 300,
    strictness = 'strict',
  } = options;
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

    // Accumulated warnings for Wire 0.2 path
    const accumulatedWarnings: VerificationWarning[] = [];

    // 2. Strictness routing for missing typ (Correction 1, DD-156)
    if (result.header.typ === undefined) {
      if (strictness === 'strict') {
        return {
          valid: false,
          code: 'E_INVALID_FORMAT',
          message: 'Missing JWS typ header: strict mode requires typ to be present',
        };
      }
      // interop mode: emit warning and continue
      accumulatedWarnings.push({
        code: WARNING_TYP_MISSING,
        message: 'JWS typ header is absent; accepted in interop mode',
      });
    }

    // 3. Validate structural kernel constraints (DD-121, fail-closed)
    const constraintResult = validateKernelConstraints(result.payload);
    if (!constraintResult.valid) {
      const v = constraintResult.violations[0];
      return {
        valid: false,
        code: 'E_CONSTRAINT_VIOLATION',
        message: `Kernel constraint violated: ${v.constraint} (actual: ${v.actual}, limit: ${v.limit})`,
      };
    }

    // 4. Validate schema (unified parser supports Wire 0.1 and Wire 0.2)
    const pr = parseReceiptClaims(result.payload);

    if (!pr.ok) {
      return {
        valid: false,
        code: 'E_INVALID_FORMAT',
        message: `Receipt schema validation failed: ${pr.error.message}`,
        details: { parse_code: pr.error.code, issues: sanitizeParseIssues(pr.error.issues) },
      };
    }

    // 5. Collect parser warnings (Wire 0.2 parser may emit type/extension warnings)
    if (pr.wireVersion === '0.2') {
      accumulatedWarnings.push(...pr.warnings);
    }

    // Wire 0.2 path
    if (pr.wireVersion === '0.2') {
      const claims = pr.claims as Wire02Claims;

      // Issuer check
      if (issuer !== undefined && claims.iss !== issuer) {
        return {
          valid: false,
          code: 'E_INVALID_ISSUER',
          message: `Issuer mismatch: expected "${issuer}", got "${claims.iss}"`,
        };
      }

      // Subject check
      if (subjectUri !== undefined && claims.sub !== subjectUri) {
        return {
          valid: false,
          code: 'E_INVALID_SUBJECT',
          message: `Subject mismatch: expected "${subjectUri}", got "${claims.sub ?? 'undefined'}"`,
        };
      }

      // iat: not-yet-valid check (with clock skew)
      if (claims.iat > now + maxClockSkew) {
        return {
          valid: false,
          code: 'E_NOT_YET_VALID',
          message: `Receipt not yet valid: issued at ${new Date(claims.iat * 1000).toISOString()}, now is ${new Date(now * 1000).toISOString()}`,
        };
      }

      // occurred_at skew check (evidence kind only)
      if (claims.kind === 'evidence') {
        const skewResult = checkOccurredAtSkew(claims.occurred_at, claims.iat, now, maxClockSkew);
        if (skewResult === 'future_error') {
          return {
            valid: false,
            code: 'E_OCCURRED_AT_FUTURE',
            message: `occurred_at is in the future beyond tolerance (${maxClockSkew}s)`,
          };
        }
        if (skewResult !== null) {
          accumulatedWarnings.push(skewResult);
        }
      }

      return {
        valid: true,
        variant: 'wire-02',
        claims,
        kid: result.header.kid,
        wireVersion: '0.2',
        warnings: sortWarnings(accumulatedWarnings),
        policy_binding: 'unavailable', // Full JCS+SHA-256 check deferred to PR 14
      };
    }

    // Wire 0.1 path (commerce or attestation)
    // Wire 0.2 receipts returned early above.
    // Both ReceiptClaimsType and AttestationReceiptClaims have: iss, aud, rid, iat, exp
    // TypeScript cannot narrow the union via wireVersion so we use a typed assertion.
    type Wire01CommonClaims = { iss: string; aud: string; rid: string; iat: number; exp?: number };
    const w01 = pr.claims as Wire01CommonClaims;

    // Shared binding checks (iss, aud, rid, iat, exp exist on both receipt types)
    if (issuer !== undefined && w01.iss !== issuer) {
      return {
        valid: false,
        code: 'E_INVALID_ISSUER',
        message: `Issuer mismatch: expected "${issuer}", got "${w01.iss}"`,
      };
    }

    if (audience !== undefined && w01.aud !== audience) {
      return {
        valid: false,
        code: 'E_INVALID_AUDIENCE',
        message: `Audience mismatch: expected "${audience}", got "${w01.aud}"`,
      };
    }

    if (rid !== undefined && w01.rid !== rid) {
      return {
        valid: false,
        code: 'E_INVALID_RECEIPT_ID',
        message: `Receipt ID mismatch: expected "${rid}", got "${w01.rid}"`,
      };
    }

    if (requireExp && w01.exp === undefined) {
      return {
        valid: false,
        code: 'E_MISSING_EXP',
        message: 'Receipt missing required exp claim',
      };
    }

    if (w01.iat > now + maxClockSkew) {
      return {
        valid: false,
        code: 'E_NOT_YET_VALID',
        message: `Receipt not yet valid: issued at ${new Date(w01.iat * 1000).toISOString()}, now is ${new Date(now * 1000).toISOString()}`,
      };
    }

    if (w01.exp !== undefined && w01.exp < now - maxClockSkew) {
      return {
        valid: false,
        code: 'E_EXPIRED',
        message: `Receipt expired at ${new Date(w01.exp * 1000).toISOString()}`,
      };
    }

    // Subject binding + typed return (variant-branched, no unsafe casts)
    if (pr.variant === 'commerce') {
      const claims = pr.claims as ReceiptClaimsType;
      if (subjectUri !== undefined && claims.subject?.uri !== subjectUri) {
        return {
          valid: false,
          code: 'E_INVALID_SUBJECT',
          message: `Subject mismatch: expected "${subjectUri}", got "${claims.subject?.uri ?? 'undefined'}"`,
        };
      }
      return {
        valid: true,
        variant: 'commerce',
        claims,
        kid: result.header.kid,
        wireVersion: '0.1',
        warnings: [],
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
      return {
        valid: true,
        variant: 'attestation',
        claims,
        kid: result.header.kid,
        wireVersion: '0.1',
        warnings: [],
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
      if (err.code === 'CRYPTO_WIRE_VERSION_MISMATCH') {
        return {
          valid: false,
          code: 'E_WIRE_VERSION_MISMATCH',
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

/**
 * Type guard: narrows a VerifyLocalResult to a Wire 0.2 success (v0.12.0-preview.1).
 *
 * Use instead of manual `result.valid && result.variant === 'wire-02'` checks
 * to get proper claims narrowing to Wire02Claims.
 */
export function isWire02Result(
  r: VerifyLocalResult
): r is VerifyLocalSuccess & { variant: 'wire-02' } {
  return r.valid === true && r.variant === 'wire-02';
}
