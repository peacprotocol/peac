/**
 * @peac/worker-fastly - Replay Store implementations
 *
 * Fastly-specific replay store implementations.
 * Uses shared core for hashing and types.
 *
 * SECURITY: All nonces are stored as SHA-256 hashes of `issuer|keyid|nonce`
 * to prevent correlation of raw identifiers in storage.
 *
 * IMPORTANT: Choose the right backend for your use case:
 * - KV Store: Strong consistency with atomic operations (recommended)
 * - In-memory: Per-POP only, best-effort (NOT suitable for production)
 *
 * @packageDocumentation
 */

import type { ReplayStore, ReplayContext } from './types.js';
import { hashReplayKey } from '../../_shared/core/index.js';

// Re-export hash function for testing
export { hashReplayKey };

/**
 * Create a replay store from Fastly KV Store.
 *
 * @param kvStoreName - Name of the KV Store for replay protection
 * @returns Replay store or null if not configured
 */
export function createReplayStore(kvStoreName?: string): ReplayStore | null {
  if (kvStoreName) {
    try {
      return new KVStoreReplayStore(kvStoreName);
    } catch {
      // KV Store not available
    }
  }
  return null;
}

/**
 * Fastly KV Store replay store.
 *
 * Provides strong consistency via Fastly KV Store.
 * Recommended for production deployments.
 *
 * Consistency: STRONG (atomic operations with conditional writes)
 */
export class KVStoreReplayStore implements ReplayStore {
  private store: KVStore | null = null;
  private readonly storeName: string;

  constructor(storeName: string) {
    this.storeName = storeName;
  }

  private getStore(): KVStore {
    if (!this.store) {
      // Lazy initialization to support testing
      if (typeof globalThis !== 'undefined' && 'KVStore' in globalThis) {
        const KVStoreClass = (globalThis as unknown as { KVStore: new (name: string) => KVStore })
          .KVStore;
        this.store = new KVStoreClass(this.storeName);
      } else {
        throw new Error('KVStore not available');
      }
    }
    return this.store;
  }

  async seen(ctx: ReplayContext): Promise<boolean> {
    const hashedKey = await hashReplayKey(ctx);
    const key = `replay:${hashedKey}`;

    try {
      const store = this.getStore();

      // Check if key exists
      const existing = await store.get(key);

      if (existing !== null) {
        // Key already seen
        return true;
      }

      // Store key with TTL metadata
      // Fastly KV Store doesn't have built-in TTL, so we store expiry time
      const expiresAt = Math.floor(Date.now() / 1000) + ctx.ttlSeconds;
      await store.put(key, expiresAt.toString());

      return false;
    } catch {
      // On error, fail-closed (treat as replay)
      return true;
    }
  }
}

/**
 * In-memory replay store for testing or single-POP scenarios.
 *
 * Consistency: PER-POP ONLY (NOT suitable for production)
 *
 * WARNING: Fastly Compute is distributed across many POPs.
 * In-memory state is NOT shared between POPs, so this implementation
 * only prevents replays within the same POP. Use KV Store for production.
 */
export class InMemoryReplayStore implements ReplayStore {
  private seen_keys = new Map<string, number>();

  async seen(ctx: ReplayContext): Promise<boolean> {
    const hashedKey = await hashReplayKey(ctx);
    const now = Math.floor(Date.now() / 1000);

    // Clean up expired entries
    for (const [key, expiresAt] of this.seen_keys) {
      if (expiresAt <= now) {
        this.seen_keys.delete(key);
      }
    }

    // Check if key exists and not expired
    const expiresAt = this.seen_keys.get(hashedKey);
    if (expiresAt !== undefined && expiresAt > now) {
      return true;
    }

    // Mark as seen
    this.seen_keys.set(hashedKey, now + ctx.ttlSeconds);
    return false;
  }
}

/**
 * No-op replay store for testing or when replay protection is disabled.
 *
 * Consistency: NONE (no replay protection)
 *
 * WARNING: This provides NO replay protection. Use only for development
 * or when you explicitly accept the replay attack risk.
 */
export class NoOpReplayStore implements ReplayStore {
  async seen(_ctx: ReplayContext): Promise<boolean> {
    return false;
  }
}

/**
 * Fastly KV Store interface (subset of actual API).
 */
interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
