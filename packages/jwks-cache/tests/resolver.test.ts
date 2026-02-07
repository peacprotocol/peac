import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createResolver } from '../src/resolver.js';
import { InMemoryCache } from '../src/cache.js';

// RFC 8037 appendix A -- valid Ed25519 public key (32 bytes base64url)
const TEST_ED25519_X = '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo';

describe('createResolver singleflight', () => {
  let fetchCallCount: number;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCallCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++;
      // Simulate network delay so both calls overlap
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          keys: [{ kty: 'OKP', crv: 'Ed25519', x: TEST_ED25519_X, kid: 'test-kid' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('coalesces concurrent resolves into one fetch', async () => {
    const resolver = createResolver({
      isAllowedHost: () => true,
    });

    // Fire two concurrent resolves for the same issuer+kid.
    // The resolver tries 3 discovery paths sequentially; the mock returns 200
    // for all URLs, so path 1 (/.well-known/jwks) succeeds on the first fetch.
    // Singleflight dedup ensures only one resolveKey executes.
    const results = await Promise.allSettled([
      resolver('https://issuer.example.com', 'test-kid'),
      resolver('https://issuer.example.com', 'test-kid'),
    ]);

    expect(fetchCallCount).toBe(1);

    // Both should resolve to the same outcome
    expect(results[0].status).toBe(results[1].status);
    expect(results[0].status).toBe('fulfilled');
  });

  it('allows independent resolves for different keys', async () => {
    const resolver = createResolver({
      isAllowedHost: () => true,
    });

    await Promise.allSettled([
      resolver('https://issuer.example.com', 'kid-a'),
      resolver('https://issuer.example.com', 'kid-b'),
    ]);

    // Different keys should NOT be coalesced -- each gets its own resolve
    expect(fetchCallCount).toBeGreaterThan(1);
  });
});

describe('createResolver stale-if-error', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does not fall back to stale on non-JwksError failures', async () => {
    // Preload an expired-but-stale-eligible entry
    const cache = new InMemoryCache();
    const cacheKey = 'https://issuer.example.com:test-kid';
    await cache.set(cacheKey, {
      jwk: { kty: 'OKP', crv: 'Ed25519', x: TEST_ED25519_X, kid: 'test-kid' },
      expiresAt: Math.floor(Date.now() / 1000) - 60, // expired 60s ago
    });

    // isAllowedHost throws a plain Error (not JwksError).
    // With fail-closed logic, this must NOT enable stale fallback --
    // even though allowStale is true and a stale entry exists.
    const resolver = createResolver({
      cache,
      isAllowedHost: () => {
        throw new Error('boom');
      },
      allowStale: true,
    });

    await expect(resolver('https://issuer.example.com', 'test-kid')).rejects.toThrow();
  });
});
