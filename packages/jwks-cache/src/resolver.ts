/**
 * JWKS resolver with multi-path discovery and caching.
 */

import type { SignatureVerifier } from '@peac/http-signatures';
import type {
  JWK,
  JWKS,
  CacheBackend,
  ResolverOptions,
  ResolvedKey,
  JwksKeyResolver,
} from './types.js';
import { ErrorCodes, JwksError } from './errors.js';
import { validateUrl } from './security.js';
import { InMemoryCache, buildCacheKey, parseCacheControlMaxAge } from './cache.js';

const DEFAULT_TTL_SECONDS = 3600; // 1 hour
const MAX_TTL_SECONDS = 86400; // 24 hours
const MIN_TTL_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB
const DEFAULT_MAX_KEYS = 100;
const DEFAULT_MAX_STALE_AGE_SECONDS = 172800; // 48 hours

/**
 * Create a JWKS key resolver with singleflight dedup.
 *
 * Concurrent calls for the same issuer+keyid coalesce into a single
 * network request, preventing thundering herd on cache miss.
 *
 * @param options - Resolver options
 * @returns Key resolver function
 */
export function createResolver(options: ResolverOptions = {}): JwksKeyResolver {
  const cache = options.cache ?? new InMemoryCache();
  const {
    defaultTtlSeconds = DEFAULT_TTL_SECONDS,
    maxTtlSeconds = MAX_TTL_SECONDS,
    minTtlSeconds = MIN_TTL_SECONDS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxKeys = DEFAULT_MAX_KEYS,
    isAllowedHost,
    allowLocalhost = false,
    allowStale = false,
    maxStaleAgeSeconds = DEFAULT_MAX_STALE_AGE_SECONDS,
  } = options;

  // Singleflight: dedup concurrent resolves for the same issuer+keyid
  const inflight = new Map<string, Promise<ResolvedKey | null>>();

  return async (issuer: string, keyid: string): Promise<SignatureVerifier | null> => {
    const flightKey = `${issuer}:${keyid}`;
    const existing = inflight.get(flightKey);
    if (existing) {
      const resolvedKey = await existing;
      return resolvedKey ? createJwkVerifier(resolvedKey.jwk) : null;
    }

    const promise = resolveKey(issuer, keyid, {
      cache,
      defaultTtlSeconds,
      maxTtlSeconds,
      minTtlSeconds,
      timeoutMs,
      maxResponseBytes,
      maxKeys,
      isAllowedHost,
      allowLocalhost,
      allowStale,
      maxStaleAgeSeconds,
    }).finally(() => {
      inflight.delete(flightKey);
    });

    inflight.set(flightKey, promise);

    const resolvedKey = await promise;
    if (!resolvedKey) {
      return null;
    }

    return createJwkVerifier(resolvedKey.jwk);
  };
}

/**
 * Resolve a key by issuer and key ID.
 *
 * Discovery order (per TAP spec):
 * 1. /.well-known/jwks
 * 2. /keys?keyID=<kid>
 * 3. /.well-known/jwks.json (fallback)
 */
export async function resolveKey(
  issuer: string,
  keyid: string,
  options: Required<
    Pick<
      ResolverOptions,
      | 'cache'
      | 'defaultTtlSeconds'
      | 'maxTtlSeconds'
      | 'minTtlSeconds'
      | 'timeoutMs'
      | 'maxResponseBytes'
      | 'maxKeys'
      | 'allowLocalhost'
      | 'allowStale'
      | 'maxStaleAgeSeconds'
    >
  > &
    Pick<ResolverOptions, 'isAllowedHost'>
): Promise<ResolvedKey | null> {
  const { cache, isAllowedHost, allowLocalhost, allowStale, maxStaleAgeSeconds } = options;

  // Normalize issuer to origin
  const issuerOrigin = new URL(issuer).origin;
  const cacheKey = buildCacheKey(issuerOrigin, keyid);

  // Check cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return {
      jwk: cached.jwk,
      source: '/.well-known/jwks',
      cached: true,
    };
  }

  // Discovery paths in order
  const paths: Array<{
    url: string;
    source: ResolvedKey['source'];
    isSingleKey: boolean;
  }> = [
    {
      url: `${issuerOrigin}/.well-known/jwks`,
      source: '/.well-known/jwks',
      isSingleKey: false,
    },
    {
      url: `${issuerOrigin}/keys?keyID=${encodeURIComponent(keyid)}`,
      source: '/keys',
      isSingleKey: true,
    },
    {
      url: `${issuerOrigin}/.well-known/jwks.json`,
      source: '/.well-known/jwks.json',
      isSingleKey: false,
    },
  ];

  const errors: Error[] = [];

  for (const path of paths) {
    try {
      // Validate URL for SSRF
      validateUrl(path.url, { isAllowedHost, allowLocalhost });

      const result = await fetchWithTimeout(path.url, options.timeoutMs);

      // Check response size
      const contentLength = result.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > options.maxResponseBytes) {
        throw new JwksError(
          ErrorCodes.JWKS_TOO_LARGE,
          `Response too large: ${contentLength} bytes`
        );
      }

      // Parse response
      const text = await result.text();
      if (text.length > options.maxResponseBytes) {
        throw new JwksError(ErrorCodes.JWKS_TOO_LARGE, `Response too large: ${text.length} bytes`);
      }

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new JwksError(ErrorCodes.JWKS_INVALID, 'Invalid JSON response');
      }

      // Extract JWK
      let jwk: JWK | null = null;

      if (path.isSingleKey) {
        // Single key endpoint returns JWK directly
        jwk = validateJwk(data);
      } else {
        // JWKS endpoint returns key set
        const jwks = validateJwks(data, options.maxKeys);
        jwk = findKey(jwks, keyid);
      }

      if (!jwk) {
        continue; // Try next path
      }

      // Calculate TTL
      const cacheControlMaxAge = parseCacheControlMaxAge(result.headers.get('cache-control'));
      const ttl = calculateTtl(
        cacheControlMaxAge,
        options.defaultTtlSeconds,
        options.minTtlSeconds,
        options.maxTtlSeconds
      );

      // Cache the key
      const now = Math.floor(Date.now() / 1000);
      await cache.set(cacheKey, {
        jwk,
        expiresAt: now + ttl,
        etag: result.headers.get('etag') ?? undefined,
      });

      return {
        jwk,
        source: path.source,
        cached: false,
      };
    } catch (error) {
      errors.push(error as Error);
      // Continue to next path
    }
  }

  // All paths failed -- try stale fallback if allowed.
  // Only fall back on transient network errors. Fail closed on security policy
  // violations (SSRF), semantic errors (invalid JWKS, too many keys, too large),
  // and parse failures -- these indicate the server is misconfigured or
  // compromised, not that the network is temporarily unreachable.
  if (errors.length > 0) {
    // Fail closed: stale only if every error is a known-transient JwksError.
    // Non-JwksError (bugs, unexpected throws) must NOT widen stale eligibility.
    const allTransient = errors.every(
      (e) =>
        e instanceof JwksError &&
        (e.code === ErrorCodes.JWKS_FETCH_FAILED || e.code === ErrorCodes.JWKS_TIMEOUT)
    );
    if (allowStale && allTransient && 'getStale' in cache && typeof cache.getStale === 'function') {
      const staleEntry = await (
        cache as { getStale: (k: string) => Promise<typeof cached> }
      ).getStale(cacheKey);
      if (staleEntry) {
        const now = Math.floor(Date.now() / 1000);
        const staleAge = now - staleEntry.expiresAt;
        if (staleAge >= 0 && staleAge <= maxStaleAgeSeconds) {
          return {
            jwk: staleEntry.jwk,
            source: '/.well-known/jwks',
            cached: true,
            stale: true,
            staleAgeSeconds: staleAge,
            keyExpiredAt: staleEntry.expiresAt,
          };
        }
      }
    }

    const lastError = errors[errors.length - 1];
    if (lastError instanceof JwksError) {
      throw lastError;
    }
    throw new JwksError(
      ErrorCodes.ALL_PATHS_FAILED,
      `All discovery paths failed for ${issuerOrigin}`
    );
  }

  return null;
}

/**
 * Fetch with timeout.
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error', // No redirect following (fail-closed)
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new JwksError(
        ErrorCodes.JWKS_FETCH_FAILED,
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new JwksError(ErrorCodes.JWKS_TIMEOUT, `Fetch timeout after ${timeoutMs}ms`);
    }
    if (error instanceof JwksError) {
      throw error;
    }
    throw new JwksError(ErrorCodes.JWKS_FETCH_FAILED, `Fetch failed: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate and extract JWK from response data.
 */
function validateJwk(data: unknown): JWK | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const jwk = data as Record<string, unknown>;

  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    return null;
  }

  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    kid: typeof jwk.kid === 'string' ? jwk.kid : undefined,
    use: typeof jwk.use === 'string' ? jwk.use : undefined,
    alg: typeof jwk.alg === 'string' ? jwk.alg : undefined,
  };
}

/**
 * Validate JWKS structure.
 */
function validateJwks(data: unknown, maxKeys: number): JWKS {
  if (!data || typeof data !== 'object') {
    throw new JwksError(ErrorCodes.JWKS_INVALID, 'Invalid JWKS structure');
  }

  const jwks = data as Record<string, unknown>;

  if (!Array.isArray(jwks.keys)) {
    throw new JwksError(ErrorCodes.JWKS_INVALID, 'JWKS must have keys array');
  }

  if (jwks.keys.length > maxKeys) {
    throw new JwksError(
      ErrorCodes.JWKS_TOO_MANY_KEYS,
      `Too many keys: ${jwks.keys.length} > ${maxKeys}`
    );
  }

  return { keys: jwks.keys as JWK[] };
}

/**
 * Find key by ID in JWKS.
 */
function findKey(jwks: JWKS, keyid: string): JWK | null {
  for (const key of jwks.keys) {
    if (key.kid === keyid) {
      return validateJwk(key);
    }
  }
  return null;
}

/**
 * Calculate TTL from Cache-Control and options.
 */
function calculateTtl(
  cacheControlMaxAge: number | null,
  defaultTtl: number,
  minTtl: number,
  maxTtl: number
): number {
  let ttl = cacheControlMaxAge ?? defaultTtl;
  ttl = Math.max(minTtl, ttl);
  ttl = Math.min(maxTtl, ttl);
  return ttl;
}

/**
 * Import a JWK as Ed25519 public key.
 *
 * Returns an opaque key object (runtime-neutral).
 * Use createJwkVerifier() for a complete SignatureVerifier.
 */
export async function importJwkAsEd25519(jwk: JWK): Promise<unknown> {
  return globalThis.crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
    },
    { name: 'Ed25519' },
    false,
    ['verify']
  );
}

/**
 * Create a SignatureVerifier from a JWK.
 *
 * Convenience function for TAP integration.
 *
 * @param jwk - Ed25519 JWK
 * @returns SignatureVerifier function
 */
export async function createJwkVerifier(jwk: JWK): Promise<SignatureVerifier> {
  const key = await importJwkAsEd25519(jwk);

  return async (data: Uint8Array, signature: Uint8Array): Promise<boolean> => {
    // Create proper ArrayBuffer views to satisfy TypeScript
    const sigBuffer = new Uint8Array(signature).buffer;
    const dataBuffer = new Uint8Array(data).buffer;

    // Use type from the actual WebCrypto API to avoid DOM type dependency
    type VerifyKey = Parameters<typeof globalThis.crypto.subtle.verify>[1];

    return globalThis.crypto.subtle.verify('Ed25519', key as VerifyKey, sigBuffer, dataBuffer);
  };
}
