/**
 * Tests for replay store implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoOpReplayStore, KVReplayStore, D1ReplayStore } from '../src/replay-store.js';

describe('NoOpReplayStore', () => {
  it('should always return false (no replay)', async () => {
    const store = new NoOpReplayStore();

    expect(await store.seen('nonce1', 480)).toBe(false);
    expect(await store.seen('nonce1', 480)).toBe(false); // Same nonce, still false
    expect(await store.seen('nonce2', 480)).toBe(false);
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

    const result = await replayStore.seen('new-nonce', 480);

    expect(result).toBe(false);
    expect(mockKV.put).toHaveBeenCalledWith('nonce:new-nonce', expect.any(String), {
      expirationTtl: 480,
    });
  });

  it('should return true for seen nonce', async () => {
    store.set('nonce:seen-nonce', Date.now().toString());
    const replayStore = new KVReplayStore(mockKV);

    const result = await replayStore.seen('seen-nonce', 480);

    expect(result).toBe(true);
    expect(mockKV.put).not.toHaveBeenCalled();
  });
});

describe('D1ReplayStore', () => {
  let mockDb: D1Database;
  let nonces: Map<string, { seenAt: number; expiresAt: number }>;

  beforeEach(() => {
    nonces = new Map();

    const mockStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn(async () => {
        // Simulate INSERT with conflict check
        return { meta: { changes: 1 } }; // Would be 0 if nonce exists
      }),
    };

    mockDb = {
      prepare: vi.fn(() => mockStatement),
    } as unknown as D1Database;
  });

  it('should return false for new nonce', async () => {
    const store = new D1ReplayStore(mockDb);

    const result = await store.seen('new-nonce', 480);

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

    // Should return true (replay) on error - fail-closed
    const result = await store.seen('error-nonce', 480);
    expect(result).toBe(true);
  });
});
