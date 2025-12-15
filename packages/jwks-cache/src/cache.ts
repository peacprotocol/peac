/**
 * In-memory cache implementation.
 */

import type { CacheBackend, CacheEntry } from './types.js';

/**
 * Simple in-memory cache with TTL support.
 */
export class InMemoryCache implements CacheBackend {
  private readonly cache = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, value: CacheEntry): Promise<void> {
    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Build cache key for a specific key ID.
 */
export function buildCacheKey(issuerOrigin: string, kid: string): string {
  return `${issuerOrigin}:${kid}`;
}

/**
 * Build cache key for JWKS set.
 */
export function buildJwksCacheKey(issuerOrigin: string): string {
  return `${issuerOrigin}:__jwks__`;
}

/**
 * Parse Cache-Control header for max-age.
 *
 * @param cacheControl - Cache-Control header value
 * @returns max-age in seconds or null if not found
 */
export function parseCacheControlMaxAge(cacheControl: string | null): number | null {
  if (!cacheControl) {
    return null;
  }

  const match = cacheControl.match(/max-age=(\d+)/);
  if (!match) {
    return null;
  }

  return parseInt(match[1], 10);
}
