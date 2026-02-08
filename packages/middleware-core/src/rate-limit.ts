/**
 * Rate-limit store interface and bounded in-memory implementation.
 *
 * Provides a pluggable rate-limit store abstraction. The default
 * MemoryRateLimitStore uses LRU eviction to bound memory usage.
 *
 * For production multi-instance deployments, implement RateLimitStore
 * backed by Redis or similar shared storage.
 */

/**
 * Pluggable rate-limit store interface.
 *
 * Increment returns the current count and window reset time.
 * Implementations must handle window expiry and cleanup.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
  /** Last access timestamp for LRU eviction */
  lastAccess: number;
}

export interface MemoryRateLimitStoreOptions {
  /** Maximum number of tracked keys before LRU eviction (default: 10000) */
  maxKeys?: number;
}

/**
 * Bounded in-memory rate-limit store with LRU eviction.
 *
 * - Expired windows are lazily cleaned on access
 * - When maxKeys is exceeded, the least-recently-accessed entry is evicted
 * - Suitable for single-instance deployments (state lost on restart)
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly maxKeys: number;

  constructor(options?: MemoryRateLimitStoreOptions) {
    this.maxKeys = options?.maxKeys ?? 10_000;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // Expired or new -- start fresh window
      entry = { count: 0, resetAt: now + windowMs, lastAccess: now };
    }

    entry.count++;
    entry.lastAccess = now;

    // Re-set to maintain Map insertion order (most recent last)
    this.store.delete(key);
    this.store.set(key, entry);

    // Evict oldest entries if over capacity
    this.evictIfNeeded();

    return { count: entry.count, resetAt: entry.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Number of tracked keys */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries */
  clear(): void {
    this.store.clear();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxKeys) {
      // Map iterates in insertion order -- first key is oldest
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}
