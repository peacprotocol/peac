/**
 * @peac/worker-core - Replay store tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUReplayStore, NoOpReplayStore } from '../src/replay.js';
import type { ReplayContext } from '../src/types.js';

describe('LRUReplayStore', () => {
  const createContext = (nonce: string): ReplayContext => ({
    issuer: 'https://issuer.example.com',
    keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
    nonce,
    ttlSeconds: 480,
  });

  it('should return false for first occurrence', async () => {
    const store = new LRUReplayStore(100);
    const ctx = createContext('nonce-1');

    const result = await store.seen(ctx);

    expect(result).toBe(false);
  });

  it('should return true for second occurrence', async () => {
    const store = new LRUReplayStore(100);
    const ctx = createContext('nonce-1');

    await store.seen(ctx);
    const result = await store.seen(ctx);

    expect(result).toBe(true);
  });

  it('should track different nonces independently', async () => {
    const store = new LRUReplayStore(100);
    const ctx1 = createContext('nonce-1');
    const ctx2 = createContext('nonce-2');

    await store.seen(ctx1);
    const result = await store.seen(ctx2);

    expect(result).toBe(false);
  });

  it('should evict oldest entries when at capacity', async () => {
    const store = new LRUReplayStore(2);
    const ctx1 = createContext('nonce-1');
    const ctx2 = createContext('nonce-2');
    const ctx3 = createContext('nonce-3');

    // Add 3 entries to a store with max size 2
    await store.seen(ctx1); // Add nonce-1, size=1
    await store.seen(ctx2); // Add nonce-2, size=2
    await store.seen(ctx3); // Add nonce-3, evict nonce-1, size=2

    // Store should be at capacity
    expect(store.size).toBe(2);

    // nonce-2 should still be present (returns true)
    const result2 = await store.seen(ctx2);
    expect(result2).toBe(true);

    // nonce-3 should still be present (returns true)
    const result3 = await store.seen(ctx3);
    expect(result3).toBe(true);
  });

  it('should re-add evicted nonce as new entry', async () => {
    const store = new LRUReplayStore(2);
    const ctx1 = createContext('nonce-1');
    const ctx2 = createContext('nonce-2');
    const ctx3 = createContext('nonce-3');

    // Add entries and cause eviction
    await store.seen(ctx1); // Add nonce-1
    await store.seen(ctx2); // Add nonce-2
    await store.seen(ctx3); // Add nonce-3, evict nonce-1

    // nonce-1 was evicted, so calling seen() again returns false (new entry)
    // This also re-adds ctx1, evicting ctx2
    const result1 = await store.seen(ctx1);
    expect(result1).toBe(false);
  });

  it('should use default maxSize of 10000', async () => {
    const store = new LRUReplayStore();
    const ctx = createContext('nonce-1');

    // Should not throw, default capacity is high
    const result = await store.seen(ctx);
    expect(result).toBe(false);
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', async () => {
      const store = new LRUReplayStore(100);
      const ctx: ReplayContext = {
        issuer: 'https://issuer.example.com',
        keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
        nonce: 'nonce-1',
        ttlSeconds: 60, // 60 second TTL
      };

      await store.seen(ctx); // First occurrence

      // Advance time past TTL
      vi.advanceTimersByTime(61 * 1000);

      // Should return false as entry expired
      const result = await store.seen(ctx);
      expect(result).toBe(false);
    });

    it('should not expire entries before TTL', async () => {
      const store = new LRUReplayStore(100);
      const ctx: ReplayContext = {
        issuer: 'https://issuer.example.com',
        keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
        nonce: 'nonce-1',
        ttlSeconds: 60, // 60 second TTL
      };

      await store.seen(ctx); // First occurrence

      // Advance time but not past TTL
      vi.advanceTimersByTime(30 * 1000);

      // Should return true as entry not expired
      const result = await store.seen(ctx);
      expect(result).toBe(true);
    });
  });
});

describe('NoOpReplayStore', () => {
  it('should always return false (never seen)', async () => {
    const store = new NoOpReplayStore();
    const ctx: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    };

    const result1 = await store.seen(ctx);
    const result2 = await store.seen(ctx);
    const result3 = await store.seen(ctx);

    expect(result1).toBe(false);
    expect(result2).toBe(false);
    expect(result3).toBe(false);
  });
});
