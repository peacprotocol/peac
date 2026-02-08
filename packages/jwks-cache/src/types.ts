/**
 * @peac/jwks-cache - Edge-safe JWKS types
 */

import type { SignatureVerifier } from '@peac/http-signatures';

/**
 * JSON Web Key (JWK) structure for Ed25519 public keys.
 */
export interface JWK {
  /** Key type - must be "OKP" for Ed25519 */
  kty: string;
  /** Curve - must be "Ed25519" */
  crv: string;
  /** Public key (base64url) */
  x: string;
  /** Key ID (optional) */
  kid?: string;
  /** Key use (optional, e.g., "sig") */
  use?: string;
  /** Algorithm (optional, e.g., "EdDSA") */
  alg?: string;
}

/**
 * JSON Web Key Set (JWKS) structure.
 */
export interface JWKS {
  keys: JWK[];
}

/**
 * Cache backend interface for pluggable storage.
 */
export interface CacheBackend {
  /**
   * Get cached value.
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key: string): Promise<CacheEntry | null>;

  /**
   * Set cached value with TTL.
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: string, value: CacheEntry): Promise<void>;

  /**
   * Delete cached value.
   * @param key - Cache key
   */
  delete(key: string): Promise<void>;
}

/**
 * Cache entry with metadata.
 */
export interface CacheEntry {
  /** Cached JWK */
  jwk: JWK;
  /** Cache expiration timestamp (Unix seconds) */
  expiresAt: number;
  /** ETag for conditional refresh (optional) */
  etag?: string;
}

/**
 * JWKS resolver options.
 */
export interface ResolverOptions {
  /** Cache backend (defaults to in-memory) */
  cache?: CacheBackend;
  /** Default TTL in seconds (defaults to 3600) */
  defaultTtlSeconds?: number;
  /** Max TTL in seconds (defaults to 86400) */
  maxTtlSeconds?: number;
  /** Min TTL in seconds (defaults to 60) */
  minTtlSeconds?: number;
  /** Fetch timeout in ms (defaults to 5000) */
  timeoutMs?: number;
  /** Max response size in bytes (defaults to 1MB) */
  maxResponseBytes?: number;
  /** Max keys in JWKS (defaults to 100) */
  maxKeys?: number;
  /** Optional allowlist callback for enterprise deployments */
  isAllowedHost?: (host: string) => boolean;
  /** Allow localhost in dev mode (defaults to false) */
  allowLocalhost?: boolean;
  /**
   * Allow serving stale cached keys when fetch fails (default: false).
   * When true, expired cache entries are served as a fallback if all
   * discovery paths fail, up to maxStaleAgeSeconds past expiry.
   */
  allowStale?: boolean;
  /**
   * Hard cap for stale age in seconds (default: 172800 / 48h).
   * Entries older than this past their original expiry are never served,
   * even with allowStale: true. Prevents silently accepting ancient keys.
   */
  maxStaleAgeSeconds?: number;
}

/**
 * Resolved key result.
 */
export interface ResolvedKey {
  /** The JWK */
  jwk: JWK;
  /** Which path resolved the key */
  source: '/.well-known/jwks' | '/.well-known/jwks.json' | '/keys';
  /** Whether result was from cache */
  cached: boolean;
  /** True when serving a past-expiry cached entry (stale-if-error) */
  stale?: boolean;
  /** How many seconds past the original TTL expiry */
  staleAgeSeconds?: number;
  /** Unix timestamp (seconds) when the cache entry expired */
  keyExpiredAt?: number;
}

/**
 * Key resolver function type for TAP integration.
 * Returns a SignatureVerifier or null if key not found.
 */
export type JwksKeyResolver = (issuer: string, keyid: string) => Promise<SignatureVerifier | null>;
