/**
 * @peac/worker-akamai - Replay Store implementations
 *
 * Akamai-specific replay store implementations.
 * Uses shared core for hashing and types.
 *
 * SECURITY: All nonces are stored as SHA-256 hashes of `issuer|keyid|nonce`
 * to prevent correlation of raw identifiers in storage.
 *
 * IMPORTANT: Choose the right backend for your use case:
 * - EdgeKV: Distributed key-value store (recommended for production)
 * - In-memory: Per-ghost only, best-effort (NOT suitable for production)
 *
 * @packageDocumentation
 */

import type { ReplayStore, ReplayContext, EdgeKVConfig } from './types.js';
import { hashReplayKey } from '../../_shared/core/index.js';

// Re-export hash function for testing
export { hashReplayKey };

/**
 * Create a replay store from EdgeKV configuration.
 *
 * @param config - EdgeKV configuration (namespace and group)
 * @returns Replay store or null if not configured
 */
export function createReplayStore(config?: EdgeKVConfig): ReplayStore | null {
  if (config) {
    try {
      return new EdgeKVReplayStore(config);
    } catch {
      // EdgeKV not available
    }
  }
  return null;
}

/**
 * Akamai EdgeKV replay store.
 *
 * Provides distributed storage via EdgeKV.
 * Recommended for production deployments.
 *
 * Consistency: EVENTUAL (EdgeKV is eventually consistent)
 *
 * Note: EdgeKV has eventual consistency. For stronger guarantees,
 * consider using a shorter TTL and accepting some replay risk,
 * or implement additional validation at origin.
 */
export class EdgeKVReplayStore implements ReplayStore {
  private readonly namespace: string;
  private readonly group: string;
  private edgeKV: EdgeKV | null = null;

  constructor(config: EdgeKVConfig) {
    this.namespace = config.namespace;
    this.group = config.group;
  }

  private getEdgeKV(): EdgeKV {
    if (!this.edgeKV) {
      // Lazy initialization to support testing
      if (typeof globalThis !== 'undefined' && 'EdgeKV' in globalThis) {
        const EdgeKVClass = (
          globalThis as unknown as {
            EdgeKV: new (options: { namespace: string; group: string }) => EdgeKV;
          }
        ).EdgeKV;
        this.edgeKV = new EdgeKVClass({
          namespace: this.namespace,
          group: this.group,
        });
      } else {
        throw new Error('EdgeKV not available');
      }
    }
    return this.edgeKV;
  }

  async seen(ctx: ReplayContext): Promise<boolean> {
    const hashedKey = await hashReplayKey(ctx);

    try {
      const edgeKV = this.getEdgeKV();

      // Check if key exists
      const existing = await edgeKV.getText({ item: hashedKey });

      if (existing !== null) {
        // Key already seen - check if still within TTL
        const storedAt = parseInt(existing, 10);
        const now = Math.floor(Date.now() / 1000);

        if (now - storedAt < ctx.ttlSeconds) {
          return true;
        }
        // Expired - allow reuse
      }

      // Store key with timestamp
      const now = Math.floor(Date.now() / 1000);
      await edgeKV.putText({
        item: hashedKey,
        value: now.toString(),
      });

      return false;
    } catch {
      // On error, fail-closed (treat as replay)
      return true;
    }
  }
}

/**
 * In-memory replay store for testing or single-ghost scenarios.
 *
 * Consistency: PER-GHOST ONLY (NOT suitable for production)
 *
 * WARNING: Akamai EdgeWorkers run on distributed "ghosts".
 * In-memory state is NOT shared between ghosts, so this implementation
 * only prevents replays within the same ghost. Use EdgeKV for production.
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
 * Akamai EdgeKV interface (subset of actual API).
 */
interface EdgeKV {
  getText(options: { item: string }): Promise<string | null>;
  putText(options: { item: string; value: string }): Promise<void>;
}
