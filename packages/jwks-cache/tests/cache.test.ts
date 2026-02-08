import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache, buildCacheKey, parseCacheControlMaxAge } from '../src/cache.js';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  it('stores and retrieves entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now + 3600,
    };

    await cache.set('key1', entry);
    const result = await cache.get('key1');

    expect(result).toEqual(entry);
  });

  it('returns null for missing entries', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for expired entries via get()', async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now - 100, // Already expired
    };

    await cache.set('key1', entry);
    const result = await cache.get('key1');

    expect(result).toBeNull();
  });

  it('returns expired entries via getStale() for stale-if-error', async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test-stale' },
      expiresAt: now - 100, // Already expired
    };

    await cache.set('key1', entry);

    // get() returns null (expired)
    expect(await cache.get('key1')).toBeNull();

    // getStale() returns the entry anyway
    const stale = await cache.getStale('key1');
    expect(stale).toEqual(entry);
    expect(stale!.jwk.x).toBe('test-stale');
  });

  it('getStale() returns null for never-cached keys', async () => {
    const result = await cache.getStale('nonexistent');
    expect(result).toBeNull();
  });

  it('retains expired entries for stale fallback (not deleted on get)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'retained' },
      expiresAt: now - 50,
    };

    await cache.set('key1', entry);
    await cache.get('key1'); // Returns null but should NOT delete

    // Entry should still be retrievable via getStale
    const stale = await cache.getStale('key1');
    expect(stale).not.toBeNull();
    expect(stale!.jwk.x).toBe('retained');
  });

  it('deletes entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    await cache.set('key1', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now + 3600,
    });

    await cache.delete('key1');
    const result = await cache.get('key1');

    expect(result).toBeNull();
  });

  it('clears all entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    await cache.set('key1', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now + 3600,
    });
    await cache.set('key2', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now + 3600,
    });

    cache.clear();

    expect(cache.size).toBe(0);
  });

  it('evicts oldest entries when maxEntries exceeded', async () => {
    const bounded = new InMemoryCache({ maxEntries: 3 });
    const now = Math.floor(Date.now() / 1000);

    await bounded.set('a', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'a' },
      expiresAt: now + 3600,
    });
    await bounded.set('b', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'b' },
      expiresAt: now + 3600,
    });
    await bounded.set('c', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'c' },
      expiresAt: now + 3600,
    });
    await bounded.set('d', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'd' },
      expiresAt: now + 3600,
    });

    expect(bounded.size).toBe(3);
    // 'a' (oldest) should have been evicted
    expect(await bounded.get('a')).toBeNull();
    expect(await bounded.getStale('a')).toBeNull();
    // 'b', 'c', 'd' should remain
    expect(await bounded.get('b')).not.toBeNull();
    expect(await bounded.get('c')).not.toBeNull();
    expect(await bounded.get('d')).not.toBeNull();
  });

  it('refreshes LRU position on get()', async () => {
    const bounded = new InMemoryCache({ maxEntries: 3 });
    const now = Math.floor(Date.now() / 1000);

    await bounded.set('a', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'a' },
      expiresAt: now + 3600,
    });
    await bounded.set('b', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'b' },
      expiresAt: now + 3600,
    });
    await bounded.set('c', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'c' },
      expiresAt: now + 3600,
    });

    // Access 'a' to refresh its LRU position
    await bounded.get('a');

    // Add 'd' -- should evict 'b' (now oldest), not 'a'
    await bounded.set('d', {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'd' },
      expiresAt: now + 3600,
    });

    expect(bounded.size).toBe(3);
    expect(await bounded.get('a')).not.toBeNull();
    expect(await bounded.get('b')).toBeNull();
    expect(await bounded.get('c')).not.toBeNull();
    expect(await bounded.get('d')).not.toBeNull();
  });
});

describe('buildCacheKey', () => {
  it('builds key from origin and kid', () => {
    expect(buildCacheKey('https://example.com', 'key1')).toBe('https://example.com:key1');
  });
});

describe('parseCacheControlMaxAge', () => {
  it('parses max-age', () => {
    expect(parseCacheControlMaxAge('max-age=3600')).toBe(3600);
    expect(parseCacheControlMaxAge('public, max-age=600')).toBe(600);
  });

  it('returns null for missing max-age', () => {
    expect(parseCacheControlMaxAge('public')).toBeNull();
    expect(parseCacheControlMaxAge(null)).toBeNull();
  });
});
