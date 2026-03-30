/**
 * Caching resolver wrapper.
 *
 * Wraps any DIDResolver with TTL-based in-memory caching.
 * Cache entries expire after configurable TTL and are evicted
 * when maxEntries is reached (oldest-first).
 *
 * The cache key is the full DID string.
 */

import type { DIDResolutionResult } from './types.js';
import type { DIDResolver } from './resolver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachingResolverOptions {
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttlMs?: number;
  /** Maximum number of cached entries (default: 1000) */
  maxEntries?: number;
}

interface CacheEntry {
  result: DIDResolutionResult;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_ENTRIES = 1000;

// ---------------------------------------------------------------------------
// CachingResolver
// ---------------------------------------------------------------------------

/**
 * Caching wrapper for any DIDResolver.
 *
 * - TTL-based expiry: entries older than ttlMs are evicted on access
 * - Max entries: oldest entries evicted when capacity is reached
 * - Only successful resolutions are cached (didDocument !== null)
 * - Failed resolutions are NOT cached (each attempt is fresh)
 *
 * @example
 * ```typescript
 * const inner = new DidKeyResolver();
 * const cached = new CachingResolver(inner, { ttlMs: 60000 });
 * const result = await cached.resolve('did:key:z6Mk...');
 * ```
 */
export class CachingResolver implements DIDResolver {
  readonly methods: readonly string[];

  private readonly inner: DIDResolver;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(inner: DIDResolver, options?: CachingResolverOptions) {
    this.inner = inner;
    this.methods = inner.methods;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async resolve(did: string): Promise<DIDResolutionResult> {
    const now = Date.now();

    // Check cache (return deep clone to prevent caller mutation of cached data)
    const cached = this.cache.get(did);
    if (cached && cached.expiresAt > now) {
      return deepCloneResult(cached.result);
    }

    // Evict expired entry if present
    if (cached) {
      this.cache.delete(did);
    }

    // Resolve from inner
    const result = await this.inner.resolve(did);

    // Only cache successful resolutions (deep clone on store to isolate)
    if (result.didDocument !== null) {
      // Evict oldest if at capacity
      if (this.cache.size >= this.maxEntries) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }

      this.cache.set(did, {
        result: deepCloneResult(result),
        expiresAt: now + this.ttlMs,
      });
    }

    return result;
  }

  /** Invalidate a specific cached entry */
  invalidate(did: string): void {
    this.cache.delete(did);
  }

  /** Clear the entire cache */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of cached entries */
  get size(): number {
    return this.cache.size;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep clone a DIDResolutionResult to prevent caller mutation of cached data.
 * Uses structuredClone (available since Node 17) for correctness.
 */
function deepCloneResult(result: DIDResolutionResult): DIDResolutionResult {
  return structuredClone(result);
}
