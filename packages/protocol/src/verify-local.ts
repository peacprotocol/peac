/**
 * Local receipt verification with schema validation
 *
 * Use this for verifying receipts when you have the public key locally,
 * without JWKS discovery.
 */

import { verify as jwsVerify } from '@peac/crypto';
import { type VerificationStrictness, type VerificationWarning, HASH } from '@peac/kernel';
import {
  parseReceiptClaims,
  validateKernelConstraints,
  type Wire02Claims,
  checkOccurredAtSkew,
  sortWarnings,
  WARNING_TYP_MISSING,
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  WARNING_EXTENSION_GROUP_MISSING,
  WARNING_EXTENSION_GROUP_MISMATCH,
  REGISTERED_RECEIPT_TYPES,
  REGISTERED_EXTENSION_GROUP_KEYS,
  isValidExtensionKey,
  verifyPolicyBinding,
} from '@peac/schema';
import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';
import { checkTypeExtensionMapping } from './type-extension-check';
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
 * These map to E_* codes in specs/kernel/errors.json.
 * JOSE hardening codes (E_JWS_*) are distinct from generic E_INVALID_FORMAT
 * so callers can distinguish key-injection, compression, and crit attacks from
 * ordinary format errors (v0.12.0-preview.1, DD-156).
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
  // JOSE hardening codes (Wire 0.2, v0.12.0-preview.1, DD-156)
  | 'E_JWS_EMBEDDED_KEY'
  | 'E_JWS_CRIT_REJECTED'
  | 'E_JWS_MISSING_KID'
  | 'E_JWS_B64_REJECTED'
  | 'E_JWS_ZIP_REJECTED'
  // Policy binding (Wire 0.2, v0.12.0-preview.1, DD-151)
  | 'E_POLICY_BINDING_FAILED'
  // Type-to-extension enforcement (Wire 0.2, v0.12.2)
  | 'E_EXTENSION_GROUP_REQUIRED'
  | 'E_EXTENSION_GROUP_MISMATCH'
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
   * @deprecated Wire 0.2 does not have an `aud` claim. This option is ignored.
   * Retained for source compatibility during migration; will be removed in v1.0.
   */
  audience?: string;

  /**
   * Expected subject URI
   *
   * If provided, verification fails if receipt.sub does not match.
   * Binds the receipt to a specific resource/interaction target.
   */
  subjectUri?: string;

  /**
   * @deprecated Wire 0.2 does not have a `rid` claim. Use `jti` for receipt identification.
   * This option is ignored. Retained for source compatibility; will be removed in v1.0.
   */
  rid?: string;

  /**
   * @deprecated Wire 0.2 receipts do not expire (permanent evidence by design).
   * This option is ignored. Retained for source compatibility; will be removed in v1.0.
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

  /**
   * Pre-computed local policy digest for policy binding (Wire 0.2, v0.12.0-preview.1, DD-151).
   *
   * Must be in 'sha256:<64 lowercase hex>' format, computed via computePolicyDigestJcs()
   * from @peac/protocol. When provided alongside a receipt that contains a policy block
   * (policy.digest), the binding check is performed:
   *   - Match: policy_binding = 'verified'
   *   - Mismatch: hard fail with E_POLICY_BINDING_FAILED
   *   - Either absent: policy_binding = 'unavailable'
   *
   * Always 'unavailable' for Wire 0.1 receipts regardless of this option.
   */
  policyDigest?: string;
}

/**
 * Result of successful local verification (Wire 0.2 only)
 *
 * Wire 0.1 receipts are no longer accepted by verifyLocal() and return
 * E_UNSUPPORTED_WIRE_VERSION. Re-issue as Wire 0.2 using issue().
 */
export interface VerifyLocalSuccess {
  /** Verification succeeded */
  valid: true;
  /** Receipt variant (always 'wire-02') */
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
   * Policy binding status (DD-49, DD-151).
   *
   * Three-state result:
   *   - 'unavailable': either the receipt contains no policy block, or the
   *     caller did not pass a policyDigest option to verifyLocal(). No check.
   *   - 'verified': both digests present and match exactly.
   *   - 'failed': not returned on success; verifyLocal() returns
   *     E_POLICY_BINDING_FAILED (valid: false) before reaching this field.
   */
  policy_binding: PolicyBindingStatus;
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

  /** Structured details for debugging (stable error code preserved in `code`) */
  details?: {
    /** Precise parse error code from unified parser (e.g. E_PARSE_COMMERCE_INVALID) */
    parse_code?: string;
    /** Zod validation issues (bounded, stable shape; non-normative, may change) */
    issues?: ReadonlyArray<{ path: string; message: string }>;
    /**
     * Policy digest from the receipt (present when code is E_POLICY_BINDING_FAILED).
     * Both are SHA-256 hashes; safe to log without leaking policy content.
     */
    receipt_policy_digest?: string;
    /** Caller-supplied policy digest (present when code is E_POLICY_BINDING_FAILED). */
    local_policy_digest?: string;
    /** policy.uri hint from the receipt (present when code is E_POLICY_BINDING_FAILED and uri set). */
    policy_uri?: string;
    /** Receipt type value (present when code is E_EXTENSION_GROUP_REQUIRED or E_EXTENSION_GROUP_MISMATCH). */
    type?: string;
    /** Expected extension group key for the receipt type. */
    expected_extension_group?: string;
    /** Registered extension groups actually present in extensions. */
    present_registered_extension_groups?: string[];
  };
}

/**
 * Union type for local verification result
 */
export type VerifyLocalResult = VerifyLocalSuccess | VerifyLocalFailure;

/**
 * Internal CRYPTO_* codes that map to generic E_INVALID_FORMAT.
 * These are format/encoding errors not security-specific.
 */
const FORMAT_ERROR_CODES = new Set([
  'CRYPTO_INVALID_JWS_FORMAT',
  'CRYPTO_INVALID_TYP',
  'CRYPTO_INVALID_ALG',
  'CRYPTO_INVALID_KEY_LENGTH',
]);

/**
 * JOSE hardening code mapping: CRYPTO_JWS_* → specific E_JWS_* (v0.12.0-preview.1, DD-156).
 *
 * Each JOSE hazard code maps to its specific public E_JWS_* counterpart rather than
 * collapsing into the generic E_INVALID_FORMAT. This lets callers distinguish embedded-key
 * injection, crit-header abuse, and unencoded-payload attacks from ordinary format errors.
 */
const JOSE_CODE_MAP: Record<string, VerifyLocalErrorCode> = {
  CRYPTO_JWS_EMBEDDED_KEY: 'E_JWS_EMBEDDED_KEY',
  CRYPTO_JWS_CRIT_REJECTED: 'E_JWS_CRIT_REJECTED',
  CRYPTO_JWS_MISSING_KID: 'E_JWS_MISSING_KID',
  CRYPTO_JWS_B64_REJECTED: 'E_JWS_B64_REJECTED',
  CRYPTO_JWS_ZIP_REJECTED: 'E_JWS_ZIP_REJECTED',
};

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
 * Verify a Wire 0.2 PEAC receipt locally with a known public key.
 *
 * Wire 0.2 only: Wire 0.1 receipts return E_UNSUPPORTED_WIRE_VERSION.
 * Re-issue Wire 0.1 receipts as Wire 0.2 using issueWire02().
 *
 * This function:
 * 1. Verifies the Ed25519 signature and header (typ, alg)
 * 2. Applies strictness routing for missing typ (strict: hard error; interop: warning)
 * 3. Validates the receipt schema with Zod (Wire 0.2 only)
 * 4. Checks issuer/subject binding (if options provided)
 * 5. Checks time validity (iat with clock skew tolerance)
 * 6. Checks occurred_at skew and collects parse warnings
 *
 * @param jws - JWS compact serialization
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param options - Optional verification options (issuer, subject, clock skew, strictness, policyDigest)
 * @returns Typed verification result
 *
 * @example
 * ```typescript
 * const result = await verifyLocal(jws, publicKey, {
 *   issuer: 'https://api.example.com',
 *   strictness: 'strict',
 * });
 * if (result.valid) {
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
  const { issuer, subjectUri, maxClockSkew = 300, strictness = 'strict', policyDigest } = options;
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

      // Emit type_unregistered warning for valid-but-unregistered type values (DD-155)
      if (!REGISTERED_RECEIPT_TYPES.has(claims.type)) {
        accumulatedWarnings.push({
          code: WARNING_TYPE_UNREGISTERED,
          message: 'Receipt type is not in the recommended type registry',
          pointer: '/type',
        });
      }

      // Emit unknown_extension_preserved warnings for unrecognized-but-well-formed keys (DD-155)
      // Malformed keys are already hard errors (E_INVALID_EXTENSION_KEY) at schema layer.
      if (claims.extensions !== undefined) {
        for (const key of Object.keys(claims.extensions)) {
          if (!REGISTERED_EXTENSION_GROUP_KEYS.has(key) && isValidExtensionKey(key)) {
            // RFC 6901: '~' -> '~0', '/' -> '~1'
            const escapedKey = key.replace(/~/g, '~0').replace(/\//g, '~1');
            accumulatedWarnings.push({
              code: WARNING_UNKNOWN_EXTENSION,
              message: 'Unknown extension key preserved without schema validation',
              pointer: `/extensions/${escapedKey}`,
            });
          }
        }
      }

      // Type-to-extension enforcement: check that the expected extension group is present
      const typeExtCheck = checkTypeExtensionMapping(
        claims.kind,
        claims.type,
        claims.extensions,
        TYPE_TO_EXTENSION_MAP,
        REGISTERED_EXTENSION_GROUP_KEYS
      );

      if (typeExtCheck.status === 'missing' || typeExtCheck.status === 'mismatch') {
        const warningCode =
          typeExtCheck.status === 'missing'
            ? WARNING_EXTENSION_GROUP_MISSING
            : WARNING_EXTENSION_GROUP_MISMATCH;
        const errorCode =
          typeExtCheck.status === 'missing'
            ? 'E_EXTENSION_GROUP_REQUIRED'
            : 'E_EXTENSION_GROUP_MISMATCH';

        if (strictness === 'strict') {
          return {
            valid: false,
            code: errorCode,
            message: `Type "${claims.type}" expects extension group "${typeExtCheck.expected_extension_group}" but it is ${typeExtCheck.status === 'mismatch' ? 'replaced by a different registered group' : 'absent'}`,
            details: {
              type: claims.type,
              expected_extension_group: typeExtCheck.expected_extension_group,
              present_registered_extension_groups: typeExtCheck.present_registered_extension_groups,
            },
          };
        }

        // Interop mode: emit warning, continue verification
        accumulatedWarnings.push({
          code: warningCode,
          message: `Type "${claims.type}" expects extension group "${typeExtCheck.expected_extension_group}"`,
          pointer: '/type',
        });
      }

      // Validate policyDigest option format (DD-151): must be sha256:<64 lowercase hex> if provided.
      if (policyDigest !== undefined && !HASH.pattern.test(policyDigest)) {
        return {
          valid: false,
          code: 'E_INVALID_FORMAT',
          message: 'policyDigest option must be in sha256:<64 lowercase hex> format',
        };
      }

      // Policy binding check (DD-151): 3-state result.
      // 'unavailable' when either receipt has no policy block or caller omitted policyDigest.
      // 'verified' / 'failed' when both are present; 'failed' is a hard verification error.
      const receiptPolicyDigest = claims.policy?.digest;
      const bindingStatus: PolicyBindingStatus =
        receiptPolicyDigest === undefined || policyDigest === undefined
          ? 'unavailable'
          : verifyPolicyBinding(receiptPolicyDigest, policyDigest);
      if (bindingStatus === 'failed') {
        return {
          valid: false,
          code: 'E_POLICY_BINDING_FAILED',
          message: 'Policy binding check failed: receipt policy digest does not match local policy',
          details: {
            receipt_policy_digest: receiptPolicyDigest,
            local_policy_digest: policyDigest,
            ...(claims.policy?.uri !== undefined && { policy_uri: claims.policy.uri }),
          },
        };
      }

      return {
        valid: true,
        variant: 'wire-02',
        claims,
        kid: result.header.kid,
        wireVersion: '0.2',
        warnings: sortWarnings(accumulatedWarnings),
        policy_binding: bindingStatus,
      };
    }

    // Wire 0.1 receipts: reject with E_UNSUPPORTED_WIRE_VERSION.
    return {
      valid: false,
      code: 'E_UNSUPPORTED_WIRE_VERSION',
      message: 'Wire 0.1 receipts are not supported. Re-issue as Wire 0.2 using issue().',
    };
  } catch (err) {
    // Handle typed CryptoError from @peac/crypto
    // Use structural check instead of instanceof for robustness across ESM/CJS boundaries
    // Map internal CRYPTO_* codes to canonical E_* codes.
    // JOSE hardening codes get specific E_JWS_* (not generic E_INVALID_FORMAT) so callers
    // can distinguish key-injection attacks from ordinary encoding errors.
    if (isCryptoError(err)) {
      // 1. JOSE hardening: specific E_JWS_* codes (checked first)
      if (Object.prototype.hasOwnProperty.call(JOSE_CODE_MAP, err.code)) {
        return {
          valid: false,
          code: JOSE_CODE_MAP[err.code]!,
          message: err.message,
        };
      }
      // 2. Generic format errors
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
 * @deprecated Removed: verifyLocal() is Wire 0.2 only and always returns variant 'wire-02'.
 * This guard always returns false. Remove usage and use isWire02Result() instead.
 */
export function isCommerceResult(
  r: VerifyLocalResult
): r is VerifyLocalSuccess & { variant: 'wire-02' } {
  // Always false: verifyLocal() only returns variant 'wire-02'
  return false;
}

/**
 * @deprecated Removed: verifyLocal() is Wire 0.2 only and always returns variant 'wire-02'.
 * This guard always returns false. Remove usage and use isWire02Result() instead.
 */
export function isAttestationResult(
  r: VerifyLocalResult
): r is VerifyLocalSuccess & { variant: 'wire-02' } {
  // Always false: verifyLocal() only returns variant 'wire-02'
  return false;
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
