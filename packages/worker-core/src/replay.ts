/**
 * PEAC Worker Core - Replay Store Implementations
 *
 * Pluggable replay detection stores with different consistency guarantees:
 * - LRUReplayStore: In-memory, best-effort (for serverless like Next.js)
 * - D1ReplayStore: Strong consistency via SQLite transactions (Cloudflare)
 * - KVReplayStore: Eventual consistency, best-effort only (NOT atomic)
 *
 * SECURITY: All replay keys are SHA-256 hashed before storage.
 * Never store raw nonce tuples - this prevents information leakage
 * if the replay store is compromised.
 *
 * @packageDocumentation
 */

import type { ReplayContext, ReplayStore } from './types.js';
import { hashReplayKey } from './hash.js';

/**
 * LRU-based replay store (in-memory).
 *
 * Best-effort only - not suitable for distributed deployments.
 * Use for serverless environments like Next.js Edge or development.
 *
 * SECURITY: Keys are SHA-256 hashed before storage.
 *
 * Implements true LRU: most-recently-used entries (checked or added) stay in cache longest.
 *
 * @example
 * ```typescript
 * const replayStore = new LRUReplayStore({ maxEntries: 10000 });
 * const handler = createHandler({
 *   keyResolver,
 *   replayStore,
 *   config: { issuerAllowlist: ['https://issuer.example'] },
 * });
 * ```
 */
export class LRUReplayStore implements ReplayStore {
  private cache: Map<string, number>;
  private maxSize: number;

  /**
   * Create a new LRU replay store.
   *
   * @param options - Max entries (number) or options object with maxEntries
   */
  constructor(options: number | { maxEntries: number } = 10000) {
    this.cache = new Map();
    this.maxSize = typeof options === 'number' ? options : options.maxEntries;
  }

  /**
   * Check if nonce has been seen and mark as seen atomically.
   *
   * Implements true LRU: checking an existing entry moves it to most-recently-used position.
   *
   * @param ctx - Replay context
   * @returns true if replay detected, false if new nonce
   */
  async seen(ctx: ReplayContext): Promise<boolean> {
    // SECURITY: Hash the key before any storage operation
    const key = await hashReplayKey(ctx);
    const now = Date.now();
    const expiryTime = now + ctx.ttlSeconds * 1000;

    // Check if exists and not expired
    const existingExpiry = this.cache.get(key);
    if (existingExpiry !== undefined) {
      if (existingExpiry > now) {
        // Replay detected! Update access order (delete + re-add to move to end)
        this.cache.delete(key);
        this.cache.set(key, existingExpiry);
        return true;
      }
      // Expired - remove and allow
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    // Add new entry (most-recently-used position)
    this.cache.set(key, expiryTime);
    return false;
  }

  /**
   * Get current size of the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Evict the oldest entry (first in map iteration order).
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }
}

/**
 * No-op replay store for development/testing.
 *
 * WARNING: This store does NOT provide replay protection.
 * Only use with UNSAFE_ALLOW_NO_REPLAY=true in development.
 */
export class NoOpReplayStore implements ReplayStore {
  async seen(_ctx: ReplayContext): Promise<boolean> {
    return false; // Always allow - no replay protection
  }
}
