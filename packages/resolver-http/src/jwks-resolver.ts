// Issuer-keyed JWKS resolution composed over jwks-cache primitives + fetch-safe.
//
// Network goes through `fetchJwksSafe` (net-node-backed; verifier-grade DNS
// pinning + redirect policy + verifier limits). `@peac/jwks-cache` is used
// for: (a) string-level URL pre-check (`validateUrl`, `isMetadataIp`),
// (b) cache primitives (`InMemoryCache`, `buildCacheKey`), and (c) crypto
// validation of the matched JWK before caching (`importJwkAsEd25519`).
// `@peac/crypto.sha256Hex` derives the per-`jwksUri` cache-key fragment so
// the same issuer with different JWKS endpoints does not collide on `kid`.
//
// `resolveKey` and `createResolver` from `@peac/jwks-cache` are NOT called:
// they use global `fetch()` internally (verified at
// `packages/jwks-cache/src/resolver.ts:284`) which lacks net-node's DNS
// pinning. Routing JWKS network through them would bypass the verifier
// boundary.

import {
  InMemoryCache,
  type InMemoryCacheOptions,
  type JWK,
  type JWKS,
  buildCacheKey,
  importJwkAsEd25519,
  isMetadataIp,
  validateUrl,
} from '@peac/jwks-cache';
import { sha256Hex } from '@peac/crypto';
import { VERIFIER_LIMITS } from '@peac/kernel';

import { fetchJwksSafe } from './fetch-safe.js';
import type { FetchSafeOptions, FetchSafeFailure, ResolverHttpErrorCode } from './types.js';

export type JwksResolveSuccess = {
  ok: true;
  jwk: JWK;
};

export type JwksResolveFailure = FetchSafeFailure;

export type JwksResolveResult = JwksResolveSuccess | JwksResolveFailure;

export interface JwksResolverOptions extends Pick<
  FetchSafeOptions,
  'timeoutMs' | 'maxResponseBytes'
> {
  /** TTL in seconds for cached keys (defaults to ISSUER_CONFIG.cacheTtlSeconds-style 3600). */
  ttlSeconds?: number;
  /** InMemoryCache options (maxEntries, etc.). */
  cacheOptions?: InMemoryCacheOptions;
}

const DEFAULT_TTL_SECONDS = 3600;

function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid-url>';
  }
}

/**
 * Normalize a `jwksUri` for cache-key derivation. Lowercases the host;
 * keeps the rest of the URL byte-for-byte (path / query / fragment matter
 * for cache identity). Returns the original string unchanged if URL parse
 * fails (the cache lookup will simply miss for a malformed URI; this code
 * path is reached only after the pre-fetch validateUrl pre-check).
 */
function normalizeJwksUri(jwksUri: string): string {
  try {
    const u = new URL(jwksUri);
    u.host = u.host.toLowerCase();
    return u.toString();
  } catch {
    return jwksUri;
  }
}

function fail(code: ResolverHttpErrorCode, origin: string): JwksResolveFailure {
  return {
    ok: false,
    code,
    message: `${code} at ${origin}`,
  };
}

function isJwk(value: unknown): value is JWK {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.kty === 'string' && typeof obj.crv === 'string' && typeof obj.x === 'string';
}

/**
 * Validate JWKS body shape locally. `@peac/jwks-cache` does not export a
 * standalone validator; the relevant logic is internal to `resolveKey`.
 *
 * Rules: object with a `keys` array; `keys.length` <= `VERIFIER_LIMITS.maxJwksKeys`;
 * each key has `kty`, `crv`, `x` strings.
 */
export function validateJwksShape(body: unknown): JWKS | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.keys)) return null;
  if (obj.keys.length > VERIFIER_LIMITS.maxJwksKeys) return null;
  for (const key of obj.keys) {
    if (!isJwk(key)) return null;
  }
  return { keys: obj.keys as JWK[] };
}

/**
 * Pre-check JWKS URL before fetch dispatch. Returns null if URL is acceptable;
 * a discriminated-union failure otherwise. Defense-in-depth: net-node also
 * enforces SSRF; this catches obviously bad URLs at the resolver-http
 * boundary so callers see a stable error class earlier in the call chain.
 */
function preCheckJwksUrl(jwksUri: string): JwksResolveFailure | null {
  let parsed: URL;
  try {
    parsed = new URL(jwksUri);
  } catch {
    return fail('fetch_blocked_https_only', '<invalid-url>');
  }
  // Metadata-IP pre-check via jwks-cache helper. resolver-http surfaces a
  // dedicated `fetch_blocked_metadata_ip` code (Step 3 mapping table).
  if (isMetadataIp(parsed.hostname)) {
    return fail('fetch_blocked_metadata_ip', `${parsed.protocol}//${parsed.host}`);
  }
  // Generic SSRF / scheme / host pre-check via jwks-cache validateUrl.
  // Throws JwksError on failure; treat any failure as fetch_blocked_ssrf
  // (HTTPS-only enforcement is also covered by fetchJwksSafe downstream).
  try {
    validateUrl(jwksUri);
  } catch {
    return fail('fetch_blocked_ssrf', `${parsed.protocol}//${parsed.host}`);
  }
  return null;
}

/**
 * Stateless JWKS fetch + body validation.
 *
 * Network goes through `fetchJwksSafe`. Body shape is validated by
 * `validateJwksShape`. No caching (callers can layer caching via
 * `IssuerJwksResolver` below).
 */
export async function fetchAndValidateJwks(
  jwksUri: string,
  options?: JwksResolverOptions
): Promise<{ ok: true; jwks: JWKS; bytes: number } | JwksResolveFailure> {
  const preCheckFailure = preCheckJwksUrl(jwksUri);
  if (preCheckFailure !== null) return preCheckFailure;

  const fetchResult = await fetchJwksSafe<unknown>(jwksUri, {
    timeoutMs: options?.timeoutMs,
    maxResponseBytes: options?.maxResponseBytes,
  });

  if (!fetchResult.ok) {
    return fetchResult;
  }

  const validated = validateJwksShape(fetchResult.body);
  if (validated === null) {
    return fail('jwks_invalid_shape', safeOrigin(jwksUri));
  }

  return { ok: true, jwks: validated, bytes: fetchResult.bytes };
}

/**
 * Find a JWK in a JWKS by `kid`. Returns null if not found.
 */
export function findKeyByKid(jwks: JWKS, kid: string): JWK | null {
  for (const key of jwks.keys) {
    if (key.kid === kid) return key;
  }
  return null;
}

/**
 * Issuer-keyed JWKS resolver with per-key caching.
 *
 * Owns an `InMemoryCache` (from `@peac/jwks-cache`) keyed by
 * `buildCacheKey(issuerOrigin, kid)`. Two issuers with overlapping `kid`
 * values resolve to distinct cache entries because the cache key includes
 * the issuer origin.
 */
export class IssuerJwksResolver {
  private readonly cache: InMemoryCache;
  private readonly ttlSeconds: number;

  constructor(options?: JwksResolverOptions) {
    this.cache = new InMemoryCache(options?.cacheOptions);
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /**
   * Resolve a single key by `(issuer, jwksUri, kid)`.
   *
   * Cache key includes a sha256 digest of the normalized `jwksUri` so that
   * the same issuer with different JWKS endpoints (e.g. tenant-specific
   * paths under one origin) does not collide on `kid`.
   *
   * Cache hit: returns the cached JWK without any network call.
   * Cache miss: pre-checks `jwksUri` via jwks-cache `validateUrl` /
   * `isMetadataIp`, fetches JWKS via `fetchJwksSafe`, validates body
   * shape, finds the key by `kid`, validates the JWK's cryptographic
   * shape via `importJwkAsEd25519` (rejects structurally plausible but
   * not actually Ed25519-loadable keys), caches it with `ttlSeconds`,
   * returns. If `kid` is not present in the fetched JWKS, returns
   * `jwks_kid_not_found`. If the matched JWK fails crypto-import,
   * returns `jwks_invalid_shape` and the JWK is NOT cached.
   */
  async resolve(
    issuer: string,
    jwksUri: string,
    kid: string,
    options?: JwksResolverOptions
  ): Promise<JwksResolveResult> {
    let issuerOrigin: string;
    try {
      issuerOrigin = new URL(issuer).origin;
    } catch {
      return fail('discovery_invalid_shape', '<invalid-url>');
    }

    const normalizedJwksUri = normalizeJwksUri(jwksUri);
    const jwksUriDigest = await sha256Hex(normalizedJwksUri);
    const cacheKey = buildCacheKey(`${issuerOrigin}#${jwksUriDigest}`, kid);
    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      return { ok: true, jwk: cached.jwk };
    }

    const fetchResult = await fetchAndValidateJwks(jwksUri, options);
    if (!fetchResult.ok) {
      return fetchResult;
    }

    const matched = findKeyByKid(fetchResult.jwks, kid);
    if (matched === null) {
      return fail('jwks_kid_not_found', issuerOrigin);
    }

    // Crypto-validate the matched JWK before caching. importJwkAsEd25519
    // calls crypto.subtle.importKey('jwk', ..., { name: 'Ed25519' }, ...)
    // which throws on non-Ed25519 / malformed-x JWKs. A structurally
    // plausible JWK with bad crypto material MUST NOT be cached.
    try {
      await importJwkAsEd25519(matched);
    } catch {
      return fail('jwks_invalid_shape', issuerOrigin);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    await this.cache.set(cacheKey, { jwk: matched, expiresAt });

    return { ok: true, jwk: matched };
  }

  /**
   * Clear cache (for tests).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Cache size (for tests).
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}
