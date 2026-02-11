/**
 * Receipt verification with JWKS fetching and caching
 */

import { verify as jwsVerify, decode } from '@peac/crypto';
import {
  PEACReceiptClaims,
  ReceiptClaims,
  SubjectProfileSnapshot,
  validateSubjectSnapshot,
} from '@peac/schema';
import { hashReceipt, fireTelemetryHook, type TelemetryHook } from './telemetry.js';

/**
 * JWKS key entry
 */
interface JWK {
  kty: string;
  crv: string;
  x: string;
  kid: string;
}

/**
 * JWKS document
 */
interface JWKS {
  keys: JWK[];
}

/**
 * In-memory JWKS cache
 * Maps issuer URL to { keys, expiresAt }
 */
const jwksCache = new Map<string, { keys: JWKS; expiresAt: number }>();

/**
 * Cache TTL (5 minutes)
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

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
 * Fetch JWKS from issuer (SSRF-safe)
 */
async function fetchJWKS(issuerUrl: string): Promise<JWKS> {
  // SSRF protection: only allow https://
  if (!issuerUrl.startsWith('https://')) {
    throw new Error('Issuer URL must be https://');
  }

  // Construct JWKS URL from discovery
  const discoveryUrl = `${issuerUrl}/.well-known/peac.txt`;

  try {
    const discoveryResp = await fetch(discoveryUrl, {
      headers: { Accept: 'text/plain' },
      // Timeout after 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!discoveryResp.ok) {
      throw new Error(`Discovery fetch failed: ${discoveryResp.status}`);
    }

    const discoveryText = await discoveryResp.text();

    // Parse YAML-like discovery (simple key: value parsing)
    const jwksLine = discoveryText.split('\n').find((line) => line.startsWith('jwks:'));
    if (!jwksLine) {
      throw new Error('No jwks field in discovery');
    }

    const jwksUrl = jwksLine.replace('jwks:', '').trim();

    // SSRF protection: verify JWKS URL is also https://
    if (!jwksUrl.startsWith('https://')) {
      throw new Error('JWKS URL must be https://');
    }

    // Fetch JWKS
    const jwksResp = await fetch(jwksUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!jwksResp.ok) {
      throw new Error(`JWKS fetch failed: ${jwksResp.status}`);
    }

    const jwks = (await jwksResp.json()) as JWKS;

    return jwks;
  } catch (err) {
    throw new Error(`JWKS fetch failed: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
}

/**
 * Get JWKS (from cache or fetch)
 */
async function getJWKS(issuerUrl: string): Promise<{ jwks: JWKS; fromCache: boolean }> {
  const now = Date.now();

  // Check cache
  const cached = jwksCache.get(issuerUrl);
  if (cached && cached.expiresAt > now) {
    return { jwks: cached.keys, fromCache: true };
  }

  // Fetch fresh JWKS
  const jwks = await fetchJWKS(issuerUrl);

  // Cache it
  jwksCache.set(issuerUrl, {
    keys: jwks,
    expiresAt: now + CACHE_TTL_MS,
  });

  return { jwks, fromCache: false };
}

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

    // Fetch JWKS
    const jwksFetchStart = performance.now();
    const { jwks, fromCache } = await getJWKS(payload.iss);
    if (!fromCache) {
      jwksFetchTime = performance.now() - jwksFetchStart;
    }

    // Find key by kid
    const jwk = jwks.keys.find((k) => k.kid === header.kid);
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
