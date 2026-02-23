/**
 * Receipt verification with strict issuer-config-based JWKS discovery
 *
 * Key discovery uses peac-issuer.json -> jwks_uri exclusively.
 * No legacy fallbacks (peac.txt, direct JWKS).
 * JWKS caching is centralized in jwks-resolver.ts.
 */

import { verify as jwsVerify, decode } from '@peac/crypto';
import {
  PEACReceiptClaims,
  ReceiptClaims,
  SubjectProfileSnapshot,
  validateSubjectSnapshot,
  validateKernelConstraints,
} from '@peac/schema';
import { resolveJWKS, type JWK } from './jwks-resolver.js';
import { hashReceipt, fireTelemetryHook, type TelemetryHook } from './telemetry.js';

/**
 * Convert JWK x coordinate to Ed25519 public key
 */
function jwkToPublicKey(jwk: JWK): Uint8Array {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new Error('Only Ed25519 keys (OKP/Ed25519) are supported');
  }

  // Decode base64url x coordinate
  const xBytes = Buffer.from(jwk.x, 'base64url');
  if (xBytes.length !== 32) {
    throw new Error('Ed25519 public key must be 32 bytes');
  }

  return new Uint8Array(xBytes);
}

/**
 * Verification result
 */
export interface VerifyResult {
  /** Verification succeeded */
  ok: true;

  /** Receipt claims */
  claims: PEACReceiptClaims;

  /** Subject profile snapshot (v0.9.17+, if provided) */
  subject_snapshot?: SubjectProfileSnapshot;

  /** Performance metrics */
  perf?: {
    verify_ms: number;
    jwks_fetch_ms?: number;
  };
}

/**
 * Verification failure
 */
export interface VerifyFailure {
  /** Verification failed */
  ok: false;

  /** Error reason */
  reason: string;

  /** Error details */
  details?: string;
}

/**
 * Options for verifying a receipt
 */
export interface VerifyOptions {
  /** JWS compact serialization */
  receiptJws: string;

  /** Subject profile snapshot (v0.9.17+, optional envelope metadata) */
  subject_snapshot?: SubjectProfileSnapshot;

  /** Telemetry hook (optional, fire-and-forget) */
  telemetry?: TelemetryHook;
}

/**
 * Verify a PEAC receipt JWS
 *
 * Uses strict issuer-config discovery: peac-issuer.json -> jwks_uri -> JWKS.
 * No fallback to peac.txt or direct JWKS endpoints.
 *
 * @param optionsOrJws - Verify options or JWS compact serialization (for backwards compatibility)
 * @returns Verification result or failure
 */
export async function verifyReceipt(
  optionsOrJws: string | VerifyOptions
): Promise<VerifyResult | VerifyFailure> {
  // Support both old (string) and new (options) signatures for backwards compatibility
  const receiptJws = typeof optionsOrJws === 'string' ? optionsOrJws : optionsOrJws.receiptJws;
  const inputSnapshot =
    typeof optionsOrJws === 'string' ? undefined : optionsOrJws.subject_snapshot;
  const telemetry = typeof optionsOrJws === 'string' ? undefined : optionsOrJws.telemetry;
  const startTime = performance.now();
  let jwksFetchTime: number | undefined;

  try {
    // Decode JWS to get issuer
    const { header, payload } = decode<PEACReceiptClaims>(receiptJws);

    // Validate structural kernel constraints (DD-121, fail-closed)
    const constraintResult = validateKernelConstraints(payload);
    if (!constraintResult.valid) {
      const v = constraintResult.violations[0];
      return {
        ok: false,
        reason: 'constraint_violation',
        details: `Kernel constraint violated: ${v.constraint} (actual: ${v.actual}, limit: ${v.limit})`,
      };
    }

    // Validate claims structure
    ReceiptClaims.parse(payload);

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      const durationMs = performance.now() - startTime;
      fireTelemetryHook(telemetry?.onReceiptVerified, {
        receiptHash: hashReceipt(receiptJws),
        valid: false,
        reasonCode: 'expired',
        issuer: payload.iss,
        kid: header.kid,
        durationMs,
      });
      return {
        ok: false,
        reason: 'expired',
        details: `Receipt expired at ${new Date(payload.exp * 1000).toISOString()}`,
      };
    }

    // Resolve JWKS via strict discovery (peac-issuer.json -> jwks_uri)
    const jwksFetchStart = performance.now();
    const jwksResult = await resolveJWKS(payload.iss);

    if (!jwksResult.ok) {
      return {
        ok: false,
        reason: jwksResult.code,
        details: jwksResult.message,
      };
    }

    if (!jwksResult.fromCache) {
      jwksFetchTime = performance.now() - jwksFetchStart;
    }

    // Find key by kid
    const jwk = jwksResult.jwks.keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      const durationMs = performance.now() - startTime;
      fireTelemetryHook(telemetry?.onReceiptVerified, {
        receiptHash: hashReceipt(receiptJws),
        valid: false,
        reasonCode: 'unknown_key',
        issuer: payload.iss,
        kid: header.kid,
        durationMs,
      });
      return {
        ok: false,
        reason: 'unknown_key',
        details: `No key found with kid=${header.kid}`,
      };
    }

    // Convert JWK to public key
    const publicKey = jwkToPublicKey(jwk);

    // Verify signature
    const result = await jwsVerify<PEACReceiptClaims>(receiptJws, publicKey);

    if (!result.valid) {
      const durationMs = performance.now() - startTime;
      fireTelemetryHook(telemetry?.onReceiptVerified, {
        receiptHash: hashReceipt(receiptJws),
        valid: false,
        reasonCode: 'invalid_signature',
        issuer: payload.iss,
        kid: header.kid,
        durationMs,
      });
      return {
        ok: false,
        reason: 'invalid_signature',
        details: 'Ed25519 signature verification failed',
      };
    }

    // Validate subject_snapshot if provided (v0.9.17+)
    // This validates schema and logs advisory PII warning if applicable
    const validatedSnapshot = validateSubjectSnapshot(inputSnapshot);

    const verifyTime = performance.now() - startTime;

    // Emit success telemetry (fire-and-forget, guarded)
    fireTelemetryHook(telemetry?.onReceiptVerified, {
      receiptHash: hashReceipt(receiptJws),
      valid: true,
      issuer: payload.iss,
      kid: header.kid,
      durationMs: verifyTime,
    });

    return {
      ok: true,
      claims: payload,
      ...(validatedSnapshot && { subject_snapshot: validatedSnapshot }),
      perf: {
        verify_ms: verifyTime,
        ...(jwksFetchTime && { jwks_fetch_ms: jwksFetchTime }),
      },
    };
  } catch (err) {
    const durationMs = performance.now() - startTime;
    fireTelemetryHook(telemetry?.onReceiptVerified, {
      receiptHash: hashReceipt(receiptJws),
      valid: false,
      reasonCode: 'verification_error',
      durationMs,
    });
    return {
      ok: false,
      reason: 'verification_error',
      details: err instanceof Error ? err.message : String(err),
    };
  }
}
