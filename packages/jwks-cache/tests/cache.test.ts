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

  it('returns null for expired entries', async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
      expiresAt: now - 100, // Already expired
    };

    await cache.set('key1', entry);
    const result = await cache.get('key1');

    expect(result).toBeNull();
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
});

describe('buildCacheKey', () => {
  it('builds key from origin and kid', () => {
    expect(buildCacheKey('https://example.com', 'key1')).toBe(
      'https://example.com:key1'
    );
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
