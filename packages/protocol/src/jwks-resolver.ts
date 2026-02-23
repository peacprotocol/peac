/**
 * Shared JWKS Resolver
 *
 * Centralizes JWKS resolution for both verify.ts and verifier-core.ts:
 * 1. Fetch peac-issuer.json from issuer origin (SSRF-safe)
 * 2. Validate issuer config (schema, issuer match, jwks_uri HTTPS)
 * 3. Fetch JWKS from jwks_uri (SSRF-safe, 64KB cap)
 * 4. Validate JWKS shape
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
  /** Blocked URL (if applicable) */
  blockedUrl?: string;
}

export type JWKSResolveResult = JWKSResolveSuccess | JWKSResolveError;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface JWKSCacheEntry {
  jwks: JWKS;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map<string, JWKSCacheEntry>();

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
// SSRF Error Mapping
// ---------------------------------------------------------------------------

/**
 * Map SSRFFetchError reason to kernel error code
 */
function mapSSRFError(reason: SSRFFetchError['reason'], context: 'issuer_config' | 'jwks'): string {
  switch (reason) {
    case 'not_https':
      return 'E_VERIFY_INSECURE_SCHEME_BLOCKED';
    case 'private_ip':
    case 'loopback':
    case 'link_local':
      return 'E_VERIFY_KEY_FETCH_BLOCKED';
    case 'timeout':
      return 'E_VERIFY_KEY_FETCH_TIMEOUT';
    case 'response_too_large':
      return context === 'jwks' ? 'E_VERIFY_JWKS_TOO_LARGE' : 'E_VERIFY_KEY_FETCH_FAILED';
    case 'dns_failure':
    case 'network_error':
    case 'too_many_redirects':
    case 'scheme_downgrade':
    case 'cross_origin_redirect':
    case 'invalid_url':
      return context === 'issuer_config'
        ? 'E_VERIFY_ISSUER_CONFIG_MISSING'
        : 'E_VERIFY_KEY_FETCH_FAILED';
    case 'jwks_too_many_keys':
      return 'E_VERIFY_JWKS_TOO_MANY_KEYS';
    default:
      return 'E_VERIFY_KEY_FETCH_FAILED';
  }
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
 * @returns Resolved JWKS or error
 */
export async function resolveJWKS(issuerUrl: string): Promise<JWKSResolveResult> {
  // Normalize issuer to origin (strip trailing slash, path)
  const normalizedIssuer = issuerUrl.replace(/\/$/, '');
  const now = Date.now();

  // Check cache first
  const cached = jwksCache.get(normalizedIssuer);
  if (cached && cached.expiresAt > now) {
    return { ok: true, jwks: cached.jwks, fromCache: true };
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
    return {
      ok: false,
      code: mapSSRFError(configResult.reason, 'issuer_config'),
      message: `Failed to fetch peac-issuer.json: ${configResult.message}`,
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

  // Step 4: Validate issuer match
  const configIssuer = issuerConfig.issuer.replace(/\/$/, '');
  if (configIssuer !== normalizedIssuer) {
    return {
      ok: false,
      code: 'E_VERIFY_ISSUER_MISMATCH',
      message: `Issuer mismatch: expected ${normalizedIssuer}, got ${configIssuer}`,
    };
  }

  // Step 5: Validate jwks_uri
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
    return {
      ok: false,
      code: mapSSRFError(jwksResult.reason, 'jwks'),
      message: `Failed to fetch JWKS from ${issuerConfig.jwks_uri}: ${jwksResult.message}`,
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

  // Cache and return
  jwksCache.set(normalizedIssuer, { jwks, expiresAt: now + CACHE_TTL_MS });

  return {
    ok: true,
    jwks,
    fromCache: false,
    rawBytes: jwksResult.rawBytes,
  };
}
