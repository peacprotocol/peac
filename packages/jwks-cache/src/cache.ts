/**
 * In-memory cache implementation.
 */

import type { CacheBackend, CacheEntry } from './types.js';

const DEFAULT_MAX_ENTRIES = 1000;

export interface InMemoryCacheOptions {
  /** Max entries before LRU eviction (default: 1000). */
  maxEntries?: number;
}

/**
 * In-memory cache with TTL, bounded size, and stale-if-error support.
 *
 * Uses Map insertion order for LRU eviction: oldest entries are evicted
 * first when maxEntries is exceeded. On get(), entries are re-inserted
 * to refresh their position (most-recently-used).
 */
export class InMemoryCache implements CacheBackend {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(options?: InMemoryCacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration -- return null but KEEP entry for stale fallback
    const now = Math.floor(Date.now() / 1000);
    if (now >= entry.expiresAt) {
      return null;
    }

    // Refresh position in Map for LRU ordering (move to end)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Get entry even if expired (for stale-if-error fallback).
   * Returns null only if key was never cached.
   */
  async getStale(key: string): Promise<CacheEntry | null> {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: CacheEntry): Promise<void> {
    // If key already exists, delete first to refresh insertion order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    this.evictIfNeeded();
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

  /**
   * Evict oldest entries (by Map insertion order) when over capacity.
   */
  private evictIfNeeded(): void {
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }
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
