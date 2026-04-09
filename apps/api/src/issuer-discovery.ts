/**
 * Opt-in issuer discovery for Hosted Verify.
 *
 * Disabled by default (allowlist-first posture). Enabled via
 * PEAC_ISSUER_DISCOVERY=true. Uses canonical SSRF-safe fetch
 * and issuer config resolution from @peac/protocol.
 *
 * When enabled: if an issuer is NOT in the allowlist, attempt
 * discovery via /.well-known/peac-issuer.json -> jwks_uri -> JWKS.
 *
 * Budget: max 5 concurrent fetches, 10/min/tenant, 5s timeout per fetch.
 */

import { fetchIssuerConfig } from '@peac/protocol';
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
  code:
    | 'E_VERIFY_ISSUER_CONFIG_MISSING'
    | 'E_VERIFY_ISSUER_CONFIG_INVALID'
    | 'E_JWKS_FETCH_FAILED'
    | 'E_KEY_NOT_FOUND';
  detail: string;
}

/**
 * Attempt SSRF-safe issuer discovery and JWKS key resolution.
 *
 * Flow: iss -> /.well-known/peac-issuer.json -> jwks_uri -> JWKS -> kid match.
 * Uses fetchIssuerConfig() from @peac/protocol (SSRF-safe internally).
 */
export async function discoverAndResolveKey(
  iss: string,
  kid: string,
  config: IssuerDiscoveryConfig
): Promise<DiscoveryResult | DiscoveryError> {
  // Fetch issuer config
  let jwksUri: string;
  try {
    const issuerConfig = await fetchIssuerConfig(iss);
    if (!issuerConfig.jwks_uri) {
      return {
        ok: false,
        code: 'E_VERIFY_ISSUER_CONFIG_INVALID',
        detail: `Issuer config at ${iss} has no jwks_uri field`,
      };
    }
    jwksUri = issuerConfig.jwks_uri;
  } catch (err) {
    return {
      ok: false,
      code: 'E_VERIFY_ISSUER_CONFIG_MISSING',
      detail: `Could not fetch issuer config for ${iss}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Resolve key from JWKS
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
    return {
      ok: false,
      code: 'E_JWKS_FETCH_FAILED',
      detail: `JWKS fetch failed for ${iss}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
