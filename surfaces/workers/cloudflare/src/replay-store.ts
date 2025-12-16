/**
 * @peac/worker-cloudflare - Replay Store implementations
 *
 * Pluggable interface for nonce replay prevention.
 *
 * IMPORTANT: Choose the right backend for your use case:
 * - Durable Objects: Strong consistency (recommended for enterprise)
 * - D1: Strong consistency (slightly higher latency)
 * - KV: Eventual consistency (best-effort only, NOT atomic)
 *
 * Cloudflare KV is NOT strongly consistent. Do NOT rely on it for
 * strong replay protection. For enterprise-grade security, use
 * Durable Objects or D1.
 */

import type { ReplayStore, Env } from './types.js';

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
 */
export class DurableObjectReplayStore implements ReplayStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  async seen(nonce: string, ttlSeconds: number): Promise<boolean> {
    // Use nonce as the DO ID for consistent routing
    const id = this.namespace.idFromName(nonce);
    const stub = this.namespace.get(id);

    // Send request to DO
    const response = await stub.fetch('http://internal/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce, ttlSeconds }),
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
 */
export class ReplayDurableObject {
  private state: DurableObjectState;
  private seenAt: number | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const { nonce, ttlSeconds } = (await request.json()) as {
      nonce: string;
      ttlSeconds: number;
    };

    const now = Math.floor(Date.now() / 1000);

    // Check if we've seen this nonce
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
 * Required schema:
 * CREATE TABLE IF NOT EXISTS nonces (
 *   nonce TEXT PRIMARY KEY,
 *   seen_at INTEGER NOT NULL,
 *   expires_at INTEGER NOT NULL
 * );
 * CREATE INDEX IF NOT EXISTS idx_nonces_expires ON nonces(expires_at);
 */
export class D1ReplayStore implements ReplayStore {
  constructor(private readonly db: D1Database) {}

  async seen(nonce: string, ttlSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;

    // Try to insert - will fail if nonce already exists
    try {
      // First, clean up expired entries (async, don't block)
      this.cleanup(now).catch(() => {
        // Ignore cleanup errors
      });

      // Atomic check-and-insert using INSERT OR IGNORE
      const result = await this.db
        .prepare(
          `
          INSERT INTO nonces (nonce, seen_at, expires_at)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM nonces WHERE nonce = ? AND expires_at > ?
          )
        `
        )
        .bind(nonce, now, expiresAt, nonce, now)
        .run();

      // If no rows were inserted, the nonce was already seen
      return result.meta.changes === 0;
    } catch {
      // On error, fail-closed (treat as replay)
      return true;
    }
  }

  private async cleanup(now: number): Promise<void> {
    await this.db.prepare('DELETE FROM nonces WHERE expires_at <= ?').bind(now).run();
  }
}

/**
 * KV replay store.
 *
 * WARNING: Cloudflare KV is eventually consistent, NOT atomic.
 * This implementation is BEST-EFFORT ONLY and may allow some replays.
 * Do NOT use for enterprise-grade security requirements.
 *
 * For strong replay protection, use Durable Objects or D1.
 */
export class KVReplayStore implements ReplayStore {
  constructor(private readonly kv: KVNamespace) {}

  async seen(nonce: string, ttlSeconds: number): Promise<boolean> {
    const key = `nonce:${nonce}`;

    // Check if nonce exists
    // WARNING: This is NOT atomic - race conditions are possible
    const existing = await this.kv.get(key);

    if (existing !== null) {
      // Nonce already seen
      return true;
    }

    // Store nonce with TTL
    // WARNING: Between the get and put, another request could have stored the same nonce
    await this.kv.put(key, Date.now().toString(), {
      expirationTtl: ttlSeconds,
    });

    return false;
  }
}

/**
 * No-op replay store for testing or when replay protection is disabled.
 *
 * WARNING: This provides NO replay protection. Use only for development.
 */
export class NoOpReplayStore implements ReplayStore {
  async seen(_nonce: string, _ttlSeconds: number): Promise<boolean> {
    return false;
  }
}
