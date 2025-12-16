/**
 * @peac/middleware-nextjs - LRU Replay Store
 *
 * Best-effort replay protection using in-memory LRU cache.
 *
 * WARNING: Per-isolate only - NOT globally consistent across edge instances.
 * Use this only when strong replay protection is not available.
 *
 * For production, consider:
 * - Redis with atomic SETNX
 * - Database with unique constraints
 * - External service with strong consistency
 */

import type { ReplayStore, ReplayContext } from './types.js';

/**
 * Entry in the LRU cache.
 */
interface CacheEntry {
  /** SHA-256 hash of issuer|keyid|nonce */
  key: string;
  /** Expiration timestamp (Unix ms) */
  expiresAt: number;
}

/**
 * LRU Replay Store configuration.
 */
export interface LRUReplayStoreOptions {
  /** Maximum entries in cache (default: 1000) */
  maxEntries?: number;
}

/**
 * Best-effort replay store using LRU cache.
 *
 * Properties:
 * - Per-isolate: Different edge instances have separate caches
 * - Eviction: Oldest entries evicted when maxEntries reached
 * - TTL: Entries automatically expire after ttlSeconds
 * - Hashing: Keys stored as SHA-256(issuer|keyid|nonce)
 *
 * Limitations:
 * - NOT atomic: Race conditions possible under high concurrency
 * - NOT distributed: Each isolate has its own cache
 * - NOT persistent: Lost on isolate restart
 */
export class LRUReplayStore implements ReplayStore {
  readonly type = 'best-effort' as const;
  private readonly maxEntries: number;
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(options: LRUReplayStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
  }

  /**
   * Check if nonce has been seen. If not, mark it as seen.
   *
   * @returns true if replay detected, false if new
   */
  async seen(ctx: ReplayContext): Promise<boolean> {
    // Hash the key to prevent correlation
    const key = await this.hashKey(ctx.issuer, ctx.keyid, ctx.nonce);
    const now = Date.now();
    const expiresAt = now + ctx.ttlSeconds * 1000;

    // Clean expired entries first
    this.cleanExpired(now);

    // Check if key exists and not expired
    const existing = this.cache.get(key);
    if (existing && existing.expiresAt > now) {
      // Replay detected
      return true;
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry (moves to end of Map iteration order)
    this.cache.set(key, { key, expiresAt });

    return false;
  }

  /**
   * Hash the replay key to prevent correlation.
   */
  private async hashKey(issuer: string, keyid: string, nonce: string): Promise<string> {
    const data = `${issuer}|${keyid}|${nonce}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Remove expired entries.
   */
  private cleanExpired(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get current cache size (for testing).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.cache.clear();
  }
}
