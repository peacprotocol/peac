/**
 * @peac/worker-fastly - Replay store tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryReplayStore, NoOpReplayStore } from '../src/replay-store.js';
import type { ReplayContext } from '../src/types.js';

describe('InMemoryReplayStore', () => {
  let store: InMemoryReplayStore;

  beforeEach(() => {
    store = new InMemoryReplayStore();
  });

  function createContext(nonce: string, ttlSeconds = 60): ReplayContext {
    return {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce,
      ttlSeconds,
    };
  }

  it('returns false for first occurrence', async () => {
    const ctx = createContext('nonce-1');
    const result = await store.seen(ctx);
    expect(result).toBe(false);
  });

  it('returns true for replay', async () => {
    const ctx = createContext('nonce-1');

    const first = await store.seen(ctx);
    expect(first).toBe(false);

    const second = await store.seen(ctx);
    expect(second).toBe(true);
  });

  it('returns true for multiple replays', async () => {
    const ctx = createContext('nonce-1');

    await store.seen(ctx);
    await store.seen(ctx);
    const third = await store.seen(ctx);
    expect(third).toBe(true);
  });

  it('tracks different nonces independently', async () => {
    const ctx1 = createContext('nonce-1');
    const ctx2 = createContext('nonce-2');

    expect(await store.seen(ctx1)).toBe(false);
    expect(await store.seen(ctx2)).toBe(false);
    expect(await store.seen(ctx1)).toBe(true);
    expect(await store.seen(ctx2)).toBe(true);
  });

  it('tracks different issuers independently', async () => {
    const ctx1: ReplayContext = {
      issuer: 'https://issuer1.example.com',
      keyid: 'https://issuer1.example.com/.well-known/jwks.json#key-1',
      nonce: 'same-nonce',
      ttlSeconds: 60,
    };
    const ctx2: ReplayContext = {
      issuer: 'https://issuer2.example.com',
      keyid: 'https://issuer2.example.com/.well-known/jwks.json#key-1',
      nonce: 'same-nonce',
      ttlSeconds: 60,
    };

    expect(await store.seen(ctx1)).toBe(false);
    expect(await store.seen(ctx2)).toBe(false);
    expect(await store.seen(ctx1)).toBe(true);
    expect(await store.seen(ctx2)).toBe(true);
  });
});

describe('NoOpReplayStore', () => {
  it('always returns false', async () => {
    const store = new NoOpReplayStore();
    const ctx: ReplayContext = {
      issuer: 'https://issuer.example.com',
      keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
      nonce: 'nonce-1',
      ttlSeconds: 60,
    };

    // Multiple calls should all return false
    expect(await store.seen(ctx)).toBe(false);
    expect(await store.seen(ctx)).toBe(false);
    expect(await store.seen(ctx)).toBe(false);
  });
});
