/**
 * @peac/worker-cloudflare - Replay Store implementations
 *
 * Cloudflare-specific replay store implementations.
 * Uses shared core for hashing and types.
 *
 * SECURITY: All nonces are stored as SHA-256 hashes of `issuer|keyid|nonce`
 * to prevent correlation of raw identifiers in storage.
 *
 * IMPORTANT: Choose the right backend for your use case:
 * - Durable Objects: Strong consistency, atomic check-and-set (enterprise)
 * - D1: Strong consistency, atomic via SQLite transactions
 * - KV: Eventual consistency, best-effort only (NOT atomic, may allow replays)
 *
 * @packageDocumentation
 */

import type { ReplayStore, ReplayContext } from './types.js';
import type { Env } from './types.js';
import { hashReplayKey } from '../../_shared/core/index.js';

// Re-export hash function for testing
export { hashReplayKey };

/**
 * Create a replay store from environment bindings.
 *
 * Priority: Durable Objects > D1 > KV > None
 */
export function createReplayStore(env: Env): ReplayStore | null {
  // Prefer Durable Objects (strongest consistency)
  if (env.REPLAY_DO) {
    return new DurableObjectReplayStore(env.REPLAY_DO);
  }

  // D1 as alternative (strong consistency)
  if (env.REPLAY_D1) {
    return new D1ReplayStore(env.REPLAY_D1);
  }

  // KV as fallback (eventual consistency - best effort only)
  if (env.REPLAY_KV) {
    return new KVReplayStore(env.REPLAY_KV);
  }

  // No replay protection configured
  return null;
}

/**
 * Durable Object replay store.
 *
 * Provides strong consistency guarantees via Durable Objects.
 * Recommended for enterprise deployments.
 *
 * Consistency: STRONG (atomic check-and-set)
 */
export class DurableObjectReplayStore implements ReplayStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  async seen(ctx: ReplayContext): Promise<boolean> {
    // Hash the context to create a storage key
    const hashedKey = await hashReplayKey(ctx);

    // Use hashed key as the DO ID for consistent routing
    const id = this.namespace.idFromName(hashedKey);
    const stub = this.namespace.get(id);

    // Send request to DO
    const response = await stub.fetch('http://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashedKey, ttlSeconds: ctx.ttlSeconds }),
    });

    const result = (await response.json()) as { replay: boolean };
    return result.replay;
  }
}

/**
 * Durable Object class for replay prevention.
 *
 * Usage: Add to wrangler.toml:
 * [[durable_objects.bindings]]
 * name = "REPLAY_DO"
 * class_name = "ReplayDurableObject"
 *
 * Note: Receives pre-hashed keys, never raw nonces.
 */
export class ReplayDurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const { hashedKey, ttlSeconds } = (await request.json()) as {
      hashedKey: string;
      ttlSeconds: number;
    };

    const now = Math.floor(Date.now() / 1000);

    // Check if we've seen this hashed key
    const stored = (await this.state.storage.get<number>('seenAt')) ?? null;

    if (stored !== null) {
      // Already seen - check if still within TTL
      if (now - stored < ttlSeconds) {
        return Response.json({ replay: true });
      }
      // Expired - allow reuse (shouldn't happen with proper nonce generation)
    }

    // Mark as seen with atomic storage
    await this.state.storage.put('seenAt', now);

    // Schedule cleanup after TTL
    await this.state.storage.setAlarm(Date.now() + ttlSeconds * 1000);

    return Response.json({ replay: false });
  }

  async alarm(): Promise<void> {
    // Clean up after TTL expires
    await this.state.storage.deleteAll();
  }
}

/**
 * D1 (SQLite) replay store.
 *
 * Provides strong consistency via SQLite transactions.
 * Slightly higher latency than Durable Objects.
 *
 * Consistency: STRONG (atomic via SQLite transactions)
 *
 * Required schema:
 * CREATE TABLE IF NOT EXISTS replay_keys (
 *   key_hash TEXT PRIMARY KEY,
 *   seen_at INTEGER NOT NULL,
 *   expires_at INTEGER NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS idx_replay_expires ON replay_keys(expires_at);
 */
export class D1ReplayStore implements ReplayStore {
  constructor(private readonly db: D1Database) {}

  async seen(ctx: ReplayContext): Promise<boolean> {
    const hashedKey = await hashReplayKey(ctx);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ctx.ttlSeconds;

    // Try to insert - will fail if key already exists
    try {
      // First, clean up expired entries (async, don't block)
      this.cleanup(now).catch(() => {
        // Ignore cleanup errors
      });

      // Atomic check-and-insert using INSERT OR IGNORE
      const result = await this.db
        .prepare(
          `
          INSERT INTO replay_keys (key_hash, seen_at, expires_at)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM replay_keys WHERE key_hash = ? AND expires_at > ?
          )
        `
        )
        .bind(hashedKey, now, expiresAt, hashedKey, now)
        .run();

      // If no rows were inserted, the key was already seen
      return result.meta.changes === 0;
    } catch {
      // On error, fail-closed (treat as replay)
      return true;
    }
  }

  private async cleanup(now: number): Promise<void> {
    await this.db.prepare('DELETE FROM replay_keys WHERE expires_at <= ?').bind(now).run();
  }
}

/**
 * KV replay store.
 *
 * Consistency: EVENTUAL (best-effort only, NOT atomic)
 *
 * WARNING: Cloudflare KV is eventually consistent, NOT atomic.
 * This implementation is BEST-EFFORT ONLY and may allow some replays
 * under concurrent load due to the read-then-write race condition.
 *
 * Do NOT use for enterprise-grade security requirements.
 * For strong replay protection, use Durable Objects or D1.
 */
export class KVReplayStore implements ReplayStore {
  constructor(private readonly kv: KVNamespace) {}

  async seen(ctx: ReplayContext): Promise<boolean> {
    const hashedKey = await hashReplayKey(ctx);
    const key = `replay:${hashedKey}`;

    // Check if key exists
    // WARNING: This is NOT atomic - race conditions are possible
    const existing = await this.kv.get(key);

    if (existing !== null) {
      // Key already seen
      return true;
    }

    // Store key with TTL
    // WARNING: Between the get and put, another request could have stored the same key
    await this.kv.put(key, Date.now().toString(), {
      expirationTtl: ctx.ttlSeconds,
    });

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
