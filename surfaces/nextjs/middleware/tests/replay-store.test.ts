/**
 * @peac/middleware-nextjs - LRU Replay Store tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUReplayStore } from '../src/replay-store.js';

describe('LRUReplayStore', () => {
  let store: LRUReplayStore;

  beforeEach(() => {
    store = new LRUReplayStore({ maxEntries: 3 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for new nonce', async () => {
    const result = await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    });

    expect(result).toBe(false);
    expect(store.size).toBe(1);
  });

  it('returns true for seen nonce', async () => {
    const ctx = {
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    };

    await store.seen(ctx);
    const result = await store.seen(ctx);

    expect(result).toBe(true);
  });

  it('evicts oldest entry when maxEntries reached', async () => {
    // Add 3 entries (max)
    await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    });
    await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-2',
      ttlSeconds: 480,
    });
    await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-3',
      ttlSeconds: 480,
    });

    expect(store.size).toBe(3);

    // Add 4th entry - should evict oldest
    await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-4',
      ttlSeconds: 480,
    });

    expect(store.size).toBe(3);

    // First nonce should be evicted, so it's "new" again
    const result = await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    });

    expect(result).toBe(false); // Was evicted, so it's new
  });

  it('expires entries after TTL', async () => {
    const ctx = {
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480, // 8 minutes
    };

    await store.seen(ctx);

    // Advance time past TTL
    vi.advanceTimersByTime(481 * 1000);

    // Should be "new" again after expiration
    const result = await store.seen(ctx);

    expect(result).toBe(false);
  });

  it('has type "best-effort"', () => {
    expect(store.type).toBe('best-effort');
  });

  it('can be cleared', async () => {
    await store.seen({
      issuer: 'https://issuer.example.com',
      keyid: 'key-1',
      nonce: 'nonce-1',
      ttlSeconds: 480,
    });

    expect(store.size).toBe(1);

    store.clear();

    expect(store.size).toBe(0);
  });

  it('isolates by issuer+keyid+nonce combination', async () => {
    // Same nonce but different issuer should be separate
    const result1 = await store.seen({
      issuer: 'https://issuer1.example.com',
      keyid: 'key-1',
      nonce: 'same-nonce',
      ttlSeconds: 480,
    });

    const result2 = await store.seen({
      issuer: 'https://issuer2.example.com',
      keyid: 'key-1',
      nonce: 'same-nonce',
      ttlSeconds: 480,
    });

    expect(result1).toBe(false); // New
    expect(result2).toBe(false); // Also new (different issuer)
    expect(store.size).toBe(2);
  });
});
