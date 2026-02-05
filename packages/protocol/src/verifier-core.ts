/**
 * PEAC Verifier Core
 *
 * Implements the verification flow per VERIFIER-SECURITY-MODEL.md with:
 * - Ordered checks with short-circuit behavior
 * - Trust pinning (issuer allowlist + RFC 7638 thumbprints)
 * - SSRF-safe network fetches
 * - Deterministic verification reports
 *
 * @packageDocumentation
 */

import {
  base64urlDecode,
  computeJwkThumbprint,
  decode,
  jwkToPublicKeyBytes,
  sha256Hex,
  verify as jwsVerify,
} from '@peac/crypto';
import { VERIFIER_LIMITS, WIRE_TYPE } from '@peac/kernel';
import { PEACReceiptClaims, ReceiptClaims } from '@peac/schema';
import type { SSRFFetchError } from './ssrf-safe-fetch.js';
import { fetchJWKSSafe, ssrfSafeFetch } from './ssrf-safe-fetch.js';
import { createReportBuilder } from './verification-report.js';
import type {
  PinnedKey,
  VerificationReport,
  VerifierPolicy,
} from './verifier-types.js';
import {
  createDefaultPolicy,
  createDigest,
  reasonCodeToErrorCode,
  ssrfErrorToReasonCode,
} from './verifier-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * JWK structure for Ed25519 keys
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
 * Issuer configuration document (/.well-known/peac-issuer.json)
 */
interface IssuerConfig {
  issuer: string;
  jwks_uri: string;
}

/**
 * Verification options for verifier-core
 */
export interface VerifyCoreOptions {
  /** Receipt JWS (compact serialization) or raw bytes */
  receipt: string | Uint8Array;
  /** Verification policy */
  policy?: VerifierPolicy;
  /** Reference time for deterministic verification (seconds since epoch) */
  referenceTime?: number;
  /** Include non-deterministic metadata in report */
  includeMeta?: boolean;
}

/**
 * Verification result
 */
export interface VerifyCoreResult {
  /** Whether verification succeeded */
  valid: boolean;
  /** Verification report */
  report: VerificationReport;
  /** Parsed claims (if valid) */
  claims?: PEACReceiptClaims;
}

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

/**
 * JWKS cache entry
 */
interface JWKSCacheEntry {
  jwks: JWKS;
  expiresAt: number;
}

/**
 * In-memory JWKS cache (5 minute TTL)
 */
const jwksCache = new Map<string, JWKSCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Normalize issuer to origin format (https://host[:port])
 */
function normalizeIssuer(issuer: string): string {
  try {
    const url = new URL(issuer);
    // Include port only if non-standard for HTTPS
    if (url.port && url.port !== '443') {
      return `${url.protocol}//${url.hostname}:${url.port}`;
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return issuer;
  }
}

/**
 * Check if issuer is in the allowlist
 */
function isIssuerAllowed(issuer: string, allowlist?: string[]): boolean {
  if (!allowlist || allowlist.length === 0) {
    // No allowlist means all issuers are allowed
    return true;
  }

  const normalized = normalizeIssuer(issuer);
  return allowlist.some(allowed => normalizeIssuer(allowed) === normalized);
}

/**
 * Find pinned key for issuer and kid
 */
function findPinnedKey(issuer: string, kid: string, pinnedKeys?: PinnedKey[]): PinnedKey | undefined {
  if (!pinnedKeys || pinnedKeys.length === 0) {
    return undefined;
  }

  const normalizedIssuer = normalizeIssuer(issuer);
  return pinnedKeys.find(
    pk => normalizeIssuer(pk.issuer) === normalizedIssuer && pk.kid === kid
  );
}

/**
 * Fetch issuer configuration
 */
async function fetchIssuerConfig(issuerOrigin: string): Promise<IssuerConfig | null> {
  const configUrl = `${issuerOrigin}/.well-known/peac-issuer.json`;

  const result = await ssrfSafeFetch(configUrl, {
    maxBytes: 65536, // 64 KB
    headers: { Accept: 'application/json' },
  });

  if (!result.ok) {
    return null;
  }

  try {
    return JSON.parse(result.body) as IssuerConfig;
  } catch {
    return null;
  }
}

/**
 * JWKS fetch result (success case)
 */
interface JWKSFetchSuccess {
  jwks: JWKS;
  fromCache: boolean;
  /** Raw JWKS bytes for digest computation (only present when not from cache) */
  rawBytes?: Uint8Array;
}

/**
 * Fetch JWKS from issuer
 */
async function fetchIssuerJWKS(
  issuerOrigin: string
): Promise<JWKSFetchSuccess | { error: SSRFFetchError }> {
  const now = Date.now();

  // Check cache
  const cached = jwksCache.get(issuerOrigin);
  if (cached && cached.expiresAt > now) {
    return { jwks: cached.jwks, fromCache: true };
  }

  // Fetch issuer config first
  const config = await fetchIssuerConfig(issuerOrigin);
  if (!config?.jwks_uri) {
    // Fallback to well-known JWKS path
    const fallbackUrl = `${issuerOrigin}/.well-known/jwks.json`;
    const result = await fetchJWKSSafe(fallbackUrl);

    if (!result.ok) {
      return { error: result };
    }

    try {
      const jwks = JSON.parse(result.body) as JWKS;
      jwksCache.set(issuerOrigin, { jwks, expiresAt: now + CACHE_TTL_MS });
      return { jwks, fromCache: false, rawBytes: result.rawBytes };
    } catch {
      return {
        error: {
          ok: false,
          reason: 'network_error',
          message: 'Invalid JWKS JSON',
        } as SSRFFetchError,
      };
    }
  }

  // Fetch JWKS from discovered URI
  const result = await fetchJWKSSafe(config.jwks_uri);

  if (!result.ok) {
    return { error: result };
  }

  try {
    const jwks = JSON.parse(result.body) as JWKS;

    // Validate JWKS limits
    if (jwks.keys.length > VERIFIER_LIMITS.maxJwksKeys) {
      return {
        error: {
          ok: false,
          reason: 'jwks_too_many_keys',
          message: `JWKS has too many keys: ${jwks.keys.length} > ${VERIFIER_LIMITS.maxJwksKeys}`,
        } as SSRFFetchError,
      };
    }

    jwksCache.set(issuerOrigin, { jwks, expiresAt: now + CACHE_TTL_MS });
    return { jwks, fromCache: false, rawBytes: result.rawBytes };
  } catch {
    return {
      error: {
        ok: false,
        reason: 'network_error',
        message: 'Invalid JWKS JSON',
      } as SSRFFetchError,
    };
  }
}

// ---------------------------------------------------------------------------
// Main Verification Function
// ---------------------------------------------------------------------------

/**
 * Verify a PEAC receipt with full security checks and report emission
 *
 * Implements the verification flow per VERIFIER-SECURITY-MODEL.md:
 * 1. jws.parse - Parse JWS structure
 * 2. limits.receipt_bytes - Check receipt size
 * 3. jws.protected_header - Validate protected header
 * 4. claims.schema_unverified - Pre-signature schema check
 * 5. issuer.trust_policy - Check issuer allowlist/pins
 * 6. issuer.discovery - Fetch JWKS (if network mode)
 * 7. key.resolve - Resolve signing key by kid
 * 8. jws.signature - Verify signature
 * 9. claims.time_window - Check iat/exp
 * 10. extensions.limits - Check extension sizes
 */
export async function verifyReceiptCore(options: VerifyCoreOptions): Promise<VerifyCoreResult> {
  const {
    receipt,
    policy = createDefaultPolicy('offline_preferred'),
    referenceTime,
    includeMeta = false,
  } = options;

  // Convert receipt to string if needed
  const receiptJws = typeof receipt === 'string'
    ? receipt
    : new TextDecoder().decode(receipt);
  const receiptBytes = typeof receipt === 'string'
    ? new TextEncoder().encode(receipt)
    : receipt;

  // Compute receipt digest for report
  const receiptDigestHex = await sha256Hex(receiptBytes);

  // Start building report
  const builder = createReportBuilder(policy);
  builder.setInputWithDigest(receiptDigestHex);

  // Current time (or reference time for deterministic verification)
  const nowSeconds = referenceTime ?? Math.floor(Date.now() / 1000);

  // Track issuer and kid for result
  let issuer: string | undefined;
  let kid: string | undefined;
  let parsedClaims: PEACReceiptClaims | undefined;

  // ---------------------------------------------------------------------------
  // Check 1: jws.parse - Parse JWS structure
  // ---------------------------------------------------------------------------
  let header: { alg: string; typ: string; kid: string };
  let payload: PEACReceiptClaims;

  try {
    const decoded = decode<PEACReceiptClaims>(receiptJws);
    header = decoded.header;
    payload = decoded.payload;
    builder.pass('jws.parse');
  } catch (err) {
    builder.fail('jws.parse', 'E_VERIFY_MALFORMED_RECEIPT', {
      error: err instanceof Error ? err.message : String(err),
    });
    builder.failure('malformed_receipt');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }

  // ---------------------------------------------------------------------------
  // Check 2: limits.receipt_bytes - Check receipt size
  // ---------------------------------------------------------------------------
  if (receiptBytes.length > policy.limits.max_receipt_bytes) {
    builder.fail('limits.receipt_bytes', 'E_VERIFY_RECEIPT_TOO_LARGE', {
      size: receiptBytes.length,
      limit: policy.limits.max_receipt_bytes,
    });
    builder.failure('receipt_too_large');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }
  builder.pass('limits.receipt_bytes', { size: receiptBytes.length });

  // ---------------------------------------------------------------------------
  // Check 3: jws.protected_header - Validate protected header
  // ---------------------------------------------------------------------------
  if (header.alg !== 'EdDSA') {
    builder.fail('jws.protected_header', 'E_VERIFY_MALFORMED_RECEIPT', {
      expected_alg: 'EdDSA',
      actual_alg: header.alg,
    });
    builder.failure('malformed_receipt');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }
  if (header.typ !== WIRE_TYPE) {
    builder.fail('jws.protected_header', 'E_VERIFY_MALFORMED_RECEIPT', {
      expected_typ: WIRE_TYPE,
      actual_typ: header.typ,
    });
    builder.failure('malformed_receipt');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }
  if (!header.kid) {
    builder.fail('jws.protected_header', 'E_VERIFY_MALFORMED_RECEIPT', {
      error: 'Missing kid in protected header',
    });
    builder.failure('malformed_receipt');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }
  kid = header.kid;
  builder.pass('jws.protected_header', { alg: header.alg, typ: header.typ, kid: header.kid });

  // ---------------------------------------------------------------------------
  // Check 4: claims.schema_unverified - Pre-signature schema check
  // ---------------------------------------------------------------------------
  try {
    ReceiptClaims.parse(payload);
    issuer = payload.iss;
    builder.pass('claims.schema_unverified');
  } catch (err) {
    builder.fail('claims.schema_unverified', 'E_VERIFY_SCHEMA_INVALID', {
      error: err instanceof Error ? err.message : String(err),
    });
    builder.failure('schema_invalid');
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }

  // ---------------------------------------------------------------------------
  // Check 5: issuer.trust_policy - Check issuer allowlist/pins
  // ---------------------------------------------------------------------------
  const normalizedIssuer = normalizeIssuer(issuer!);

  if (!isIssuerAllowed(issuer!, policy.issuer_allowlist)) {
    builder.fail('issuer.trust_policy', 'E_VERIFY_ISSUER_NOT_ALLOWED', {
      issuer: normalizedIssuer,
      allowlist: policy.issuer_allowlist,
    });
    builder.failure('issuer_not_allowed', normalizedIssuer, kid);
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }
  builder.pass('issuer.trust_policy', { issuer: normalizedIssuer });

  // ---------------------------------------------------------------------------
  // Check 6: issuer.discovery - Fetch JWKS (if network mode)
  // Check 7: key.resolve - Resolve signing key by kid
  // ---------------------------------------------------------------------------
  let publicKey: Uint8Array;
  let keySource: 'pinned_keys' | 'jwks_discovery';
  let keyThumbprint: string | undefined;
  let jwksRawBytes: Uint8Array | undefined;

  // Check for pinned key first
  const pinnedKey = findPinnedKey(issuer!, kid!, policy.pinned_keys);

  if (pinnedKey) {
    // Use pinned key - skip discovery
    builder.skip('issuer.discovery', { reason: 'pinned_key_available' });

    // Check if pinned key has key material for offline verification
    if (pinnedKey.jwk) {
      // Full JWK provided - verify thumbprint and use directly
      const actualThumbprint = await computeJwkThumbprint(pinnedKey.jwk);
      if (actualThumbprint !== pinnedKey.jwk_thumbprint_sha256) {
        builder.fail('key.resolve', 'E_VERIFY_POLICY_VIOLATION', {
          error: 'Pinned JWK thumbprint does not match declared thumbprint',
          expected: pinnedKey.jwk_thumbprint_sha256,
          actual: actualThumbprint,
        });
        builder.failure('policy_violation', normalizedIssuer, kid);
        return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
      }
      publicKey = jwkToPublicKeyBytes(pinnedKey.jwk);
      keySource = 'pinned_keys';
      keyThumbprint = actualThumbprint;
      builder.pass('key.resolve', { source: keySource, kid, thumbprint_verified: true, offline: true });
    } else if (pinnedKey.public_key) {
      // Raw public key bytes provided (base64url, 32 bytes for Ed25519)
      try {
        publicKey = base64urlDecode(pinnedKey.public_key);
        if (publicKey.length !== 32) {
          throw new Error(`Expected 32 bytes, got ${publicKey.length}`);
        }
        keySource = 'pinned_keys';
        // Note: We can't compute thumbprint from raw key bytes alone
        // The thumbprint is computed from canonical JWK JSON
        // Use the declared thumbprint from the pinned key entry
        keyThumbprint = pinnedKey.jwk_thumbprint_sha256;
        builder.pass('key.resolve', { source: keySource, kid, offline: true, thumbprint_verified: false });
      } catch (err) {
        builder.fail('key.resolve', 'E_VERIFY_KEY_NOT_FOUND', {
          error: `Invalid pinned public_key: ${err instanceof Error ? err.message : String(err)}`,
        });
        builder.failure('key_not_found', normalizedIssuer, kid);
        return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
      }
    } else if (policy.mode === 'offline_only') {
      // Offline mode but pinned key has no key material - fail
      builder.fail('key.resolve', 'E_VERIFY_KEY_NOT_FOUND', {
        error: 'Offline mode requires key material (jwk or public_key) in pinned_keys',
      });
      builder.failure('key_not_found', normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    } else {
      // Network mode - fetch JWKS and verify thumbprint
      const jwksResult = await fetchIssuerJWKS(normalizedIssuer);

      if ('error' in jwksResult) {
        const reason = ssrfErrorToReasonCode(jwksResult.error.reason, 'key');
        builder.fail('issuer.discovery', reasonCodeToErrorCode(reason), {
          error: jwksResult.error.message,
          url: jwksResult.error.blockedUrl,
        });
        builder.failure(reason, normalizedIssuer, kid);
        return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
      }

      // Store raw bytes for digest computation (only when not from cache)
      if (jwksResult.rawBytes) {
        jwksRawBytes = jwksResult.rawBytes;
      }

      builder.pass('issuer.discovery', {
        from_cache: jwksResult.fromCache,
        keys_count: jwksResult.jwks.keys.length,
      });

      // Find the key
      const jwk = jwksResult.jwks.keys.find(k => k.kid === kid);
      if (!jwk) {
        builder.fail('key.resolve', 'E_VERIFY_KEY_NOT_FOUND', {
          kid,
          available_kids: jwksResult.jwks.keys.map(k => k.kid),
        });
        builder.failure('key_not_found', normalizedIssuer, kid);
        return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
      }

      // Verify thumbprint matches
      const actualThumbprint = await computeJwkThumbprint(jwk);
      if (actualThumbprint !== pinnedKey.jwk_thumbprint_sha256) {
        builder.fail('key.resolve', 'E_VERIFY_POLICY_VIOLATION', {
          error: 'JWK thumbprint does not match pinned key',
          expected: pinnedKey.jwk_thumbprint_sha256,
          actual: actualThumbprint,
        });
        builder.failure('policy_violation', normalizedIssuer, kid);
        return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
      }

      publicKey = jwkToPublicKeyBytes(jwk);
      keySource = 'pinned_keys';
      keyThumbprint = actualThumbprint;
      builder.pass('key.resolve', { source: keySource, kid, thumbprint_verified: true });
    }
  } else {
    // No pinned key - need to discover
    if (policy.mode === 'offline_only') {
      builder.fail('issuer.discovery', 'E_VERIFY_KEY_NOT_FOUND', {
        error: 'Offline mode requires pinned keys',
      });
      builder.failure('key_not_found', normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    }

    const jwksResult = await fetchIssuerJWKS(normalizedIssuer);

    if ('error' in jwksResult) {
      const reason = ssrfErrorToReasonCode(jwksResult.error.reason, 'key');
      builder.fail('issuer.discovery', reasonCodeToErrorCode(reason), {
        error: jwksResult.error.message,
        url: jwksResult.error.blockedUrl,
      });
      builder.failure(reason, normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    }

    // Store raw bytes for digest computation (only when not from cache)
    if (jwksResult.rawBytes) {
      jwksRawBytes = jwksResult.rawBytes;
    }

    builder.pass('issuer.discovery', {
      from_cache: jwksResult.fromCache,
      keys_count: jwksResult.jwks.keys.length,
    });

    // Find the key
    const jwk = jwksResult.jwks.keys.find(k => k.kid === kid);
    if (!jwk) {
      builder.fail('key.resolve', 'E_VERIFY_KEY_NOT_FOUND', {
        kid,
        available_kids: jwksResult.jwks.keys.map(k => k.kid),
      });
      builder.failure('key_not_found', normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    }

    publicKey = jwkToPublicKeyBytes(jwk);
    keySource = 'jwks_discovery';
    keyThumbprint = await computeJwkThumbprint(jwk);
    builder.pass('key.resolve', { source: keySource, kid, thumbprint: keyThumbprint });
  }

  // ---------------------------------------------------------------------------
  // Check 8: jws.signature - Verify signature
  // ---------------------------------------------------------------------------
  try {
    const result = await jwsVerify<PEACReceiptClaims>(receiptJws, publicKey);

    if (!result.valid) {
      builder.fail('jws.signature', 'E_VERIFY_SIGNATURE_INVALID', {
        error: 'Ed25519 signature verification failed',
      });
      builder.failure('signature_invalid', normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    }

    parsedClaims = result.payload;
    builder.pass('jws.signature');
  } catch (err) {
    builder.fail('jws.signature', 'E_VERIFY_SIGNATURE_INVALID', {
      error: err instanceof Error ? err.message : String(err),
    });
    builder.failure('signature_invalid', normalizedIssuer, kid);
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }

  // ---------------------------------------------------------------------------
  // Check 9: claims.time_window - Check iat/exp
  // ---------------------------------------------------------------------------
  const iatTolerance = 60; // 60 seconds tolerance for future iat

  // Check iat (issued at) - required field per schema
  if (parsedClaims!.iat > nowSeconds + iatTolerance) {
    builder.fail('claims.time_window', 'E_VERIFY_NOT_YET_VALID', {
      error: 'Receipt issued in the future',
      iat: parsedClaims!.iat,
      now: nowSeconds,
      tolerance: iatTolerance,
    });
    builder.failure('not_yet_valid', normalizedIssuer, kid);
    return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
  }

  // Check exp (expiration) - no tolerance
  if (parsedClaims!.exp) {
    if (parsedClaims!.exp < nowSeconds) {
      builder.fail('claims.time_window', 'E_VERIFY_EXPIRED', {
        error: 'Receipt expired',
        exp: parsedClaims!.exp,
        now: nowSeconds,
      });
      builder.failure('expired', normalizedIssuer, kid);
      return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
    }
  }

  builder.pass('claims.time_window', {
    iat: parsedClaims!.iat,
    exp: parsedClaims!.exp,
    now: nowSeconds,
  });

  // ---------------------------------------------------------------------------
  // Check 10: extensions.limits - Check extension sizes
  // ---------------------------------------------------------------------------
  // Check for oversized extensions in ext object
  if (parsedClaims!.ext) {
    for (const [extKey, extValue] of Object.entries(parsedClaims!.ext)) {
      if (extValue !== undefined) {
        const extJson = JSON.stringify(extValue);
        if (extJson.length > policy.limits.max_extension_bytes) {
          builder.fail('extensions.limits', 'E_VERIFY_EXTENSION_TOO_LARGE', {
            extension: extKey,
            size: extJson.length,
            limit: policy.limits.max_extension_bytes,
          });
          builder.failure('extension_too_large', normalizedIssuer, kid);
          return { valid: false, report: includeMeta ? builder.addTimestamp().build() : builder.build() };
        }
      }
    }
  }

  builder.pass('extensions.limits');

  // ---------------------------------------------------------------------------
  // Success!
  // ---------------------------------------------------------------------------
  builder.success(normalizedIssuer, kid!);

  // Add JWKS artifacts for enterprise debuggability
  // Map internal key source to artifact format
  const artifactKeySource = keySource === 'pinned_keys' ? 'pinned' : 'jwks_fetch';
  builder.addArtifact('issuer_key_source', artifactKeySource);

  if (keyThumbprint) {
    builder.addArtifact('issuer_key_thumbprint', keyThumbprint);
  }

  // Add JWKS digest when fetched (not from cache)
  // Computed over raw bytes to avoid encoding round-trip issues
  if (jwksRawBytes) {
    const jwksDigestHex = await sha256Hex(jwksRawBytes);
    builder.addArtifact('issuer_jwks_digest', createDigest(jwksDigestHex));
  }

  const report = includeMeta ? builder.addTimestamp().build() : builder.build();

  return {
    valid: true,
    report,
    claims: parsedClaims,
  };
}

/**
 * Clear the JWKS cache
 */
export function clearJWKSCache(): void {
  jwksCache.clear();
}

/**
 * Get JWKS cache size (for testing)
 */
export function getJWKSCacheSize(): number {
  return jwksCache.size;
}
