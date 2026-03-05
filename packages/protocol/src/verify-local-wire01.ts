/**
 * Wire 0.1 receipt verification (internal-only)
 *
 * Extracted from verify-local.ts for Wire 0.1 isolation.
 * This function is NOT exported from @peac/protocol barrel (src/index.ts).
 * It exists for internal test migration and programmatic migration tooling only.
 *
 * For new code, use verifyLocal() which is Wire 0.2 only.
 */

import { verify as jwsVerify } from '@peac/crypto';
import type { VerificationStrictness, VerificationWarning } from '@peac/kernel';
import {
  parseReceiptClaims,
  validateKernelConstraints,
  type ReceiptClaimsType,
  type AttestationReceiptClaims,
} from '@peac/schema';
import type { PolicyBindingStatus } from './verifier-types';
import type { VerifyLocalErrorCode, VerifyLocalFailure, VerifyLocalOptions } from './verify-local';

/**
 * Result of successful Wire 0.1 local verification
 */
export type VerifyLocalWire01Success =
  | {
      valid: true;
      variant: 'commerce';
      claims: ReceiptClaimsType;
      kid: string;
      wireVersion: '0.1';
      warnings: VerificationWarning[];
      policy_binding: PolicyBindingStatus;
    }
  | {
      valid: true;
      variant: 'attestation';
      claims: AttestationReceiptClaims;
      kid: string;
      wireVersion: '0.1';
      warnings: VerificationWarning[];
      policy_binding: PolicyBindingStatus;
    };

/**
 * Union type for Wire 0.1 local verification result
 */
export type VerifyLocalWire01Result = VerifyLocalWire01Success | VerifyLocalFailure;

/**
 * Structural type for CryptoError
 */
interface CryptoErrorLike {
  name: 'CryptoError';
  code: string;
  message: string;
}

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

const FORMAT_ERROR_CODES = new Set([
  'CRYPTO_INVALID_JWS_FORMAT',
  'CRYPTO_INVALID_TYP',
  'CRYPTO_INVALID_ALG',
  'CRYPTO_INVALID_KEY_LENGTH',
]);

const JOSE_CODE_MAP: Record<string, VerifyLocalErrorCode> = {
  CRYPTO_JWS_EMBEDDED_KEY: 'E_JWS_EMBEDDED_KEY',
  CRYPTO_JWS_CRIT_REJECTED: 'E_JWS_CRIT_REJECTED',
  CRYPTO_JWS_MISSING_KID: 'E_JWS_MISSING_KID',
  CRYPTO_JWS_B64_REJECTED: 'E_JWS_B64_REJECTED',
  CRYPTO_JWS_ZIP_REJECTED: 'E_JWS_ZIP_REJECTED',
};

const MAX_PARSE_ISSUES = 25;

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
 * Verify a Wire 0.1 PEAC receipt locally with a known public key.
 *
 * Internal-only: NOT barrel-exported from @peac/protocol.
 * For new code, use verifyLocal() (Wire 0.2 only).
 */
export async function verifyLocalWire01(
  jws: string,
  publicKey: Uint8Array,
  options: VerifyLocalOptions = {}
): Promise<VerifyLocalWire01Result> {
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
    const result = await jwsVerify<unknown>(jws, publicKey);

    if (!result.valid) {
      return {
        valid: false,
        code: 'E_INVALID_SIGNATURE',
        message: 'Ed25519 signature verification failed',
      };
    }

    // Strictness routing for missing typ
    if (result.header.typ === undefined) {
      if (strictness === 'strict') {
        return {
          valid: false,
          code: 'E_INVALID_FORMAT',
          message: 'Missing JWS typ header: strict mode requires typ to be present',
        };
      }
      // interop mode: tolerate missing typ for Wire 0.1
    }

    // Kernel constraints
    const constraintResult = validateKernelConstraints(result.payload);
    if (!constraintResult.valid) {
      const v = constraintResult.violations[0];
      return {
        valid: false,
        code: 'E_CONSTRAINT_VIOLATION',
        message: `Kernel constraint violated: ${v.constraint} (actual: ${v.actual}, limit: ${v.limit})`,
      };
    }

    // Schema validation (unified parser)
    const pr = parseReceiptClaims(result.payload);

    if (!pr.ok) {
      return {
        valid: false,
        code: 'E_INVALID_FORMAT',
        message: `Receipt schema validation failed: ${pr.error.message}`,
        details: { parse_code: pr.error.code, issues: sanitizeParseIssues(pr.error.issues) },
      };
    }

    // Reject Wire 0.2 receipts from this function
    if (pr.wireVersion === '0.2') {
      return {
        valid: false,
        code: 'E_WIRE_VERSION_MISMATCH',
        message: 'Wire 0.2 receipt passed to verifyLocalWire01(): use verifyLocal() instead',
      };
    }

    // Wire 0.1 path (commerce or attestation)
    type Wire01CommonClaims = { iss: string; aud: string; rid: string; iat: number; exp?: number };
    const w01 = pr.claims as Wire01CommonClaims;

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

    // Subject binding + typed return
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
    if (isCryptoError(err)) {
      if (Object.prototype.hasOwnProperty.call(JOSE_CODE_MAP, err.code)) {
        return {
          valid: false,
          code: JOSE_CODE_MAP[err.code]!,
          message: err.message,
        };
      }
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

    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      code: 'E_INTERNAL',
      message: `Unexpected verification error: ${message}`,
    };
  }
}
