import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRateLimitStore } from '../src/rate-limit.js';

describe('MemoryRateLimitStore', () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore({ maxKeys: 5 });
  });

  it('increments count within a window', async () => {
    const r1 = await store.increment('ip-1', 60_000);
    expect(r1.count).toBe(1);

    const r2 = await store.increment('ip-1', 60_000);
    expect(r2.count).toBe(2);

    // Same reset time
    expect(r1.resetAt).toBe(r2.resetAt);
  });

  it('resets expired windows', async () => {
    // Use a very short window to test expiry
    const r1 = await store.increment('ip-1', 1); // 1ms window
    expect(r1.count).toBe(1);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 5));

    const r2 = await store.increment('ip-1', 1);
    expect(r2.count).toBe(1); // Reset to 1
    expect(r2.resetAt).not.toBe(r1.resetAt);
  });

  it('tracks different keys independently', async () => {
    await store.increment('ip-1', 60_000);
    await store.increment('ip-1', 60_000);
    const r1 = await store.increment('ip-1', 60_000);

    const r2 = await store.increment('ip-2', 60_000);

    expect(r1.count).toBe(3);
    expect(r2.count).toBe(1);
  });

  it('resets a specific key', async () => {
    await store.increment('ip-1', 60_000);
    await store.increment('ip-1', 60_000);
    expect(store.size).toBe(1);

    await store.reset('ip-1');
    expect(store.size).toBe(0);

    const r = await store.increment('ip-1', 60_000);
    expect(r.count).toBe(1);
  });

  it('evicts oldest entries when maxKeys exceeded', async () => {
    // maxKeys = 5, add 6 entries
    for (let i = 1; i <= 6; i++) {
      await store.increment(`ip-${i}`, 60_000);
    }

    // Should have evicted ip-1 (oldest)
    expect(store.size).toBe(5);

    // ip-1 was evicted, incrementing starts fresh
    const r = await store.increment('ip-1', 60_000);
    expect(r.count).toBe(1);
  });

  it('clears all entries', () => {
    // Sync operations for setup
    store.increment('ip-1', 60_000);
    store.increment('ip-2', 60_000);
    store.clear();
    expect(store.size).toBe(0);
  });
});
