/**
 * Tests for replay store implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NoOpReplayStore,
  KVReplayStore,
  D1ReplayStore,
  hashReplayKey,
} from '../src/replay-store.js';
import type { ReplayContext } from '../src/types.js';

// Helper to create a test context
function createTestContext(nonce: string, ttlSeconds = 480): ReplayContext {
  return {
    issuer: 'https://issuer.example.com',
    keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
    nonce,
    ttlSeconds,
  };
}

describe('hashReplayKey', () => {
  it('should produce consistent hashes', async () => {
    const ctx = createTestContext('test-nonce');
    const hash1 = await hashReplayKey(ctx);
    const hash2 = await hashReplayKey(ctx);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
  });

  it('should produce different hashes for different inputs', async () => {
    const ctx1 = createTestContext('nonce-1');
    const ctx2 = createTestContext('nonce-2');

    const hash1 = await hashReplayKey(ctx1);
    const hash2 = await hashReplayKey(ctx2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('NoOpReplayStore', () => {
  it('should always return false (no replay)', async () => {
    const store = new NoOpReplayStore();

    expect(await store.seen(createTestContext('nonce1'))).toBe(false);
    expect(await store.seen(createTestContext('nonce1'))).toBe(false); // Same nonce, still false
    expect(await store.seen(createTestContext('nonce2'))).toBe(false);
  });
});

describe('KVReplayStore', () => {
  let mockKV: KVNamespace;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    mockKV = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string, _options?: unknown) => {
        store.set(key, value);
      }),
    } as unknown as KVNamespace;
  });

  it('should return false for new nonce', async () => {
    const replayStore = new KVReplayStore(mockKV);
    const ctx = createTestContext('new-nonce');

    const result = await replayStore.seen(ctx);

    expect(result).toBe(false);
    // Verify put was called with hashed key
    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringMatching(/^replay:[a-f0-9]{64}$/),
      expect.any(String),
      { expirationTtl: 480 }
    );
  });

  it('should return true for seen nonce', async () => {
    const replayStore = new KVReplayStore(mockKV);
    const ctx = createTestContext('seen-nonce');

    // Pre-populate with the hashed key
    const hashedKey = await hashReplayKey(ctx);
    store.set(`replay:${hashedKey}`, Date.now().toString());

    const result = await replayStore.seen(ctx);

    expect(result).toBe(true);
    expect(mockKV.put).not.toHaveBeenCalled();
  });
});

describe('D1ReplayStore', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    const mockStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(async () => {
        // Simulate INSERT with conflict check
        return { meta: { changes: 1 } }; // Would be 0 if key exists
      }),
    };

    mockDb = {
      prepare: vi.fn(() => mockStatement),
    } as unknown as D1Database;
  });

  it('should return false for new nonce', async () => {
    const replayStore = new D1ReplayStore(mockDb);
    const ctx = createTestContext('new-nonce');

    const result = await replayStore.seen(ctx);

    expect(result).toBe(false);
    expect(mockDb.prepare).toHaveBeenCalled();
  });

  it('should handle database errors gracefully (fail-closed)', async () => {
    const errorDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn(async () => {
          throw new Error('Database error');
        }),
      })),
    } as unknown as D1Database;

    const store = new D1ReplayStore(errorDb);
    const ctx = createTestContext('error-nonce');

    // Should return true (replay) on error - fail-closed
    const result = await store.seen(ctx);
    expect(result).toBe(true);
  });
});
