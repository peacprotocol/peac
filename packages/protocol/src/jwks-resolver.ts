/**
 * Shared JWKS Resolver
 *
 * Centralizes JWKS resolution for both verify.ts and verifier-core.ts:
 * 1. Fetch peac-issuer.json from issuer origin (SSRF-safe)
 * 2. Validate issuer config (schema, issuer match)
 * 3. Validate jwks_uri is HTTPS (protocol-level enforcement)
 * 4. Fetch JWKS from jwks_uri (SSRF-safe, 64KB cap)
 * 5. Validate JWKS shape
 *
 * No fallback paths: peac-issuer.json with jwks_uri is the only
 * supported key discovery mechanism.
 *
 * @packageDocumentation
 */

import { VERIFIER_LIMITS } from '@peac/kernel';
import { PEAC_ISSUER_CONFIG_MAX_BYTES } from '@peac/schema';
import { parseIssuerConfig } from './discovery.js';
import type { SSRFFetchError } from './ssrf-safe-fetch.js';
import { fetchJWKSSafe, ssrfSafeFetch } from './ssrf-safe-fetch.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * JWK structure for Ed25519 keys
 */
export interface JWK {
  kty: string;
  crv: string;
  x: string;
  kid: string;
}

/**
 * JWKS document
 */
export interface JWKS {
  keys: JWK[];
}

/**
 * Successful JWKS resolution
 */
export interface JWKSResolveSuccess {
  ok: true;
  jwks: JWKS;
  fromCache: boolean;
  /** Raw JWKS bytes for digest computation (only present when not from cache) */
  rawBytes?: Uint8Array;
}

/**
 * JWKS resolution error
 */
export interface JWKSResolveError {
  ok: false;
  /** Kernel error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Original SSRF reason (preserved for diagnostic fidelity) */
  reason?: SSRFFetchError['reason'];
  /** Blocked URL (if applicable) */
  blockedUrl?: string;
}

export type JWKSResolveResult = JWKSResolveSuccess | JWKSResolveError;

/**
 * Options for JWKS resolution
 */
export interface ResolveJWKSOptions {
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTtlMs?: number;
  /** Maximum cache entries before LRU eviction (default: 1000) */
  maxCacheEntries?: number;
  /** Bypass cache entirely (default: false) */
  noCache?: boolean;
}

// ---------------------------------------------------------------------------
// Cache (LRU via Map insertion order)
// ---------------------------------------------------------------------------

interface JWKSCacheEntry {
  jwks: JWKS;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 1000;
const jwksCache = new Map<string, JWKSCacheEntry>();

/**
 * LRU cache get: promotes entry to most-recently-used position.
 * Returns undefined if expired or missing.
 */
function cacheGet(key: string, now: number): JWKSCacheEntry | undefined {
  const entry = jwksCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    jwksCache.delete(key);
    return undefined;
  }
  // LRU promote: delete and re-insert to move to end (most recent)
  jwksCache.delete(key);
  jwksCache.set(key, entry);
  return entry;
}

/**
 * LRU cache set: inserts entry and evicts oldest if over capacity.
 */
function cacheSet(key: string, entry: JWKSCacheEntry, maxEntries: number): void {
  if (jwksCache.has(key)) jwksCache.delete(key);
  jwksCache.set(key, entry);
  // Evict oldest entries (Map iteration order = insertion order)
  while (jwksCache.size > maxEntries) {
    const oldestKey = jwksCache.keys().next().value;
    if (oldestKey !== undefined) jwksCache.delete(oldestKey);
  }
}

/**
 * Clear the shared JWKS cache
 */
export function clearJWKSCache(): void {
  jwksCache.clear();
}

/**
 * Get JWKS cache size (for testing)
 * @internal
 */
export function getJWKSCacheSize(): number {
  return jwksCache.size;
}

// ---------------------------------------------------------------------------
// Issuer Normalization
// ---------------------------------------------------------------------------

/**
 * Canonicalize an issuer URL to its origin (scheme + host + port).
 * Uses URL parsing for interop correctness: handles trailing slashes,
 * paths, default port elision, and IDN normalization.
 *
 * Returns a discriminated result so callers can distinguish malformed URLs
 * from valid non-HTTPS URLs (different error codes).
 *
 * Examples:
 *   "https://api.example.com/"      -> ok: "https://api.example.com"
 *   "https://api.example.com/v1"    -> ok: "https://api.example.com"
 *   "https://api.example.com:443"   -> ok: "https://api.example.com"
 *   "https://api.example.com:8443"  -> ok: "https://api.example.com:8443"
 *   "not-a-url"                     -> error
 */
function canonicalizeIssuerOrigin(
  issuerUrl: string
): { ok: true; origin: string } | { ok: false; message: string } {
  try {
    const origin = new URL(issuerUrl).origin;
    // Non-hierarchical URIs (data:, blob:) return "null" as origin
    if (origin === 'null') {
      return { ok: false, message: `Issuer URL has no valid origin: ${issuerUrl}` };
    }
    return { ok: true, origin };
  } catch {
    return { ok: false, message: `Issuer URL is not a valid URL: ${issuerUrl}` };
  }
}

// ---------------------------------------------------------------------------
// SSRF Error Mapping
// ---------------------------------------------------------------------------

/**
 * Map SSRFFetchError to kernel error code while preserving the original reason.
 * Returns both the kernel code and the original SSRF reason for diagnostic fidelity.
 */
function mapSSRFError(
  reason: SSRFFetchError['reason'],
  context: 'issuer_config' | 'jwks'
): { code: string; reason: SSRFFetchError['reason'] } {
  let code: string;
  switch (reason) {
    case 'not_https':
      code = 'E_VERIFY_INSECURE_SCHEME_BLOCKED';
      break;
    case 'private_ip':
    case 'loopback':
    case 'link_local':
      code = 'E_VERIFY_KEY_FETCH_BLOCKED';
      break;
    case 'timeout':
      code = 'E_VERIFY_KEY_FETCH_TIMEOUT';
      break;
    case 'response_too_large':
      code = context === 'jwks' ? 'E_VERIFY_JWKS_TOO_LARGE' : 'E_VERIFY_KEY_FETCH_FAILED';
      break;
    case 'dns_failure':
    case 'network_error':
    case 'too_many_redirects':
    case 'scheme_downgrade':
    case 'cross_origin_redirect':
    case 'invalid_url':
      code =
        context === 'issuer_config'
          ? 'E_VERIFY_ISSUER_CONFIG_MISSING'
          : 'E_VERIFY_KEY_FETCH_FAILED';
      break;
    case 'jwks_too_many_keys':
      code = 'E_VERIFY_JWKS_TOO_MANY_KEYS';
      break;
    default:
      code = 'E_VERIFY_KEY_FETCH_FAILED';
      break;
  }
  return { code, reason };
}

// ---------------------------------------------------------------------------
// Main Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve JWKS for an issuer using strict discovery:
 * peac-issuer.json -> jwks_uri -> JWKS
 *
 * No fallback to direct JWKS or peac.txt key discovery.
 *
 * @param issuerUrl - Issuer origin URL (e.g. "https://api.example.com")
 * @param options - Cache and resolution options
 * @returns Resolved JWKS or error
 */
export async function resolveJWKS(
  issuerUrl: string,
  options?: ResolveJWKSOptions
): Promise<JWKSResolveResult> {
  const cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxCacheEntries = options?.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const noCache = options?.noCache ?? false;

  // Normalize issuer to origin via URL parsing (interop-correct)
  const normalized = canonicalizeIssuerOrigin(issuerUrl);
  if (!normalized.ok) {
    return {
      ok: false,
      code: 'E_VERIFY_INSECURE_SCHEME_BLOCKED',
      message: normalized.message,
      blockedUrl: issuerUrl,
    };
  }
  const normalizedIssuer = normalized.origin;
  const now = Date.now();

  // Check cache first (unless bypassed)
  if (!noCache) {
    const cached = cacheGet(normalizedIssuer, now);
    if (cached) {
      return { ok: true, jwks: cached.jwks, fromCache: true };
    }
  }

  // Step 1: Require HTTPS
  if (!normalizedIssuer.startsWith('https://')) {
    return {
      ok: false,
      code: 'E_VERIFY_INSECURE_SCHEME_BLOCKED',
      message: `Issuer URL must be HTTPS: ${normalizedIssuer}`,
      blockedUrl: normalizedIssuer,
    };
  }

  // Step 2: Fetch peac-issuer.json
  const configUrl = `${normalizedIssuer}/.well-known/peac-issuer.json`;
  const configResult = await ssrfSafeFetch(configUrl, {
    maxBytes: PEAC_ISSUER_CONFIG_MAX_BYTES,
    headers: { Accept: 'application/json' },
  });

  if (!configResult.ok) {
    const mapped = mapSSRFError(configResult.reason, 'issuer_config');
    return {
      ok: false,
      code: mapped.code,
      message: `Failed to fetch peac-issuer.json: ${configResult.message}`,
      reason: mapped.reason,
      blockedUrl: configResult.blockedUrl,
    };
  }

  // Step 3: Parse and validate issuer config
  let issuerConfig: ReturnType<typeof parseIssuerConfig>;
  try {
    issuerConfig = parseIssuerConfig(configResult.body);
  } catch (err) {
    return {
      ok: false,
      code: 'E_VERIFY_ISSUER_CONFIG_INVALID',
      message: `Invalid peac-issuer.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 4: Validate issuer match (both sides canonicalized to origin)
  const configIssuerResult = canonicalizeIssuerOrigin(issuerConfig.issuer);
  const configIssuer = configIssuerResult.ok ? configIssuerResult.origin : issuerConfig.issuer;
  if (configIssuer !== normalizedIssuer) {
    return {
      ok: false,
      code: 'E_VERIFY_ISSUER_MISMATCH',
      message: `Issuer mismatch: expected ${normalizedIssuer}, got ${configIssuer}`,
    };
  }

  // Step 5: Validate jwks_uri (HTTPS enforcement at resolver layer, not parser)
  if (!issuerConfig.jwks_uri) {
    return {
      ok: false,
      code: 'E_VERIFY_JWKS_URI_INVALID',
      message: 'peac-issuer.json missing required jwks_uri field',
    };
  }

  if (!issuerConfig.jwks_uri.startsWith('https://')) {
    return {
      ok: false,
      code: 'E_VERIFY_JWKS_URI_INVALID',
      message: `jwks_uri must be HTTPS: ${issuerConfig.jwks_uri}`,
      blockedUrl: issuerConfig.jwks_uri,
    };
  }

  // Step 6: Fetch JWKS from jwks_uri
  const jwksResult = await fetchJWKSSafe(issuerConfig.jwks_uri);

  if (!jwksResult.ok) {
    const mapped = mapSSRFError(jwksResult.reason, 'jwks');
    return {
      ok: false,
      code: mapped.code,
      message: `Failed to fetch JWKS from ${issuerConfig.jwks_uri}: ${jwksResult.message}`,
      reason: mapped.reason,
      blockedUrl: jwksResult.blockedUrl,
    };
  }

  // Step 7: Parse and validate JWKS
  let jwks: JWKS;
  try {
    jwks = JSON.parse(jwksResult.body) as JWKS;
  } catch {
    return {
      ok: false,
      code: 'E_VERIFY_JWKS_INVALID',
      message: 'JWKS response is not valid JSON',
    };
  }

  if (!jwks.keys || !Array.isArray(jwks.keys)) {
    return {
      ok: false,
      code: 'E_VERIFY_JWKS_INVALID',
      message: 'JWKS missing required keys array',
    };
  }

  if (jwks.keys.length > VERIFIER_LIMITS.maxJwksKeys) {
    return {
      ok: false,
      code: 'E_VERIFY_JWKS_TOO_MANY_KEYS',
      message: `JWKS has too many keys: ${jwks.keys.length} > ${VERIFIER_LIMITS.maxJwksKeys}`,
    };
  }

  // Cache and return (with LRU eviction)
  if (!noCache) {
    cacheSet(normalizedIssuer, { jwks, expiresAt: now + cacheTtlMs }, maxCacheEntries);
  }

  return {
    ok: true,
    jwks,
    fromCache: false,
    rawBytes: jwksResult.rawBytes,
  };
}
