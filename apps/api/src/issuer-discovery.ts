/**
 * Opt-in issuer discovery for Hosted Verify.
 *
 * Disabled by default (allowlist-first posture). Enabled via
 * PEAC_ISSUER_DISCOVERY=true. Delegates to resolveKey() from
 * @peac/jwks-cache which handles iss->jwks_uri->JWKS resolution
 * with built-in caching and HTTPS enforcement.
 *
 * Current limitations (documented honestly):
 * - No explicit concurrency semaphore (relies on Node event loop)
 * - No per-tenant discovery rate limiter (shares handler-level rate limit)
 * - Cache partitioning via issuer key in @peac/jwks-cache
 *
 * These limitations are acceptable for alpha. Full budget enforcement
 * (semaphore, per-tenant discovery rate) is v0.12.9 scope.
 */

import { resolveKey, InMemoryCache, type CacheBackend } from '@peac/jwks-cache';
import { jwkToPublicKeyBytes } from '@peac/crypto';

export interface IssuerDiscoveryConfig {
  enabled: boolean;
  fetchTimeoutMs: number;
  cacheTtlSeconds: number;
}

const DEFAULT_CONFIG: IssuerDiscoveryConfig = {
  enabled: false,
  fetchTimeoutMs: 5_000,
  cacheTtlSeconds: 300,
};

export function loadDiscoveryConfig(): IssuerDiscoveryConfig {
  return {
    ...DEFAULT_CONFIG,
    enabled: process.env.PEAC_ISSUER_DISCOVERY === 'true',
  };
}

const discoveryCache: CacheBackend = new InMemoryCache();

export interface DiscoveryResult {
  ok: true;
  publicKeyBytes: Uint8Array;
}

export interface DiscoveryError {
  ok: false;
  code: 'E_VERIFY_ISSUER_CONFIG_MISSING' | 'E_JWKS_FETCH_FAILED' | 'E_KEY_NOT_FOUND';
  detail: string;
}

/**
 * Attempt issuer discovery and JWKS key resolution via resolveKey().
 *
 * resolveKey() from @peac/jwks-cache handles the full flow:
 * iss -> /.well-known/jwks.json (discovered from issuer) -> JWKS -> kid match.
 * HTTPS-only enforcement and timeout are handled by the cache layer.
 */
export async function discoverAndResolveKey(
  iss: string,
  kid: string,
  config: IssuerDiscoveryConfig
): Promise<DiscoveryResult | DiscoveryError> {
  try {
    const resolved = await resolveKey(iss, kid, {
      cache: discoveryCache,
      defaultTtlSeconds: config.cacheTtlSeconds,
      maxTtlSeconds: 86400,
      minTtlSeconds: 60,
      timeoutMs: config.fetchTimeoutMs,
      maxResponseBytes: 256 * 1024,
      maxKeys: 100,
      allowLocalhost: false,
      allowStale: true,
      maxStaleAgeSeconds: 600,
    });

    if (!resolved) {
      return {
        ok: false,
        code: 'E_KEY_NOT_FOUND',
        detail: `No key with kid ${kid} found in JWKS for ${iss}`,
      };
    }

    return { ok: true, publicKeyBytes: jwkToPublicKeyBytes(resolved.jwk) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish issuer config errors from JWKS fetch errors
    if (msg.includes('issuer') || msg.includes('config') || msg.includes('not found')) {
      return { ok: false, code: 'E_VERIFY_ISSUER_CONFIG_MISSING', detail: msg };
    }
    return { ok: false, code: 'E_JWKS_FETCH_FAILED', detail: msg };
  }
}
