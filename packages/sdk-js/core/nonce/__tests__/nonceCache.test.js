// core/nonce/__tests__/nonceCache.test.js
const { NonceCache, NONCE_TTL_MS } = require('../nonceCache');

describe('NonceCache', () => {
  let cache;

  beforeEach(() => {
    cache = new NonceCache();
  });

  test('accepts fresh nonce', () => {
    expect(
      cache.checkAndStore('bot-123', 'nonce1', Date.now())
    ).toBe(true);
  });

  test('rejects replayed nonce', () => {
    const now = Date.now();
    cache.checkAndStore('bot-123', 'nonce2', now);
    expect(cache.checkAndStore('bot-123', 'nonce2', now)).toBe(false);
  });

  test('accepts different nonce', () => {
    const now = Date.now();
    cache.checkAndStore('bot-123', 'nonce3', now);
    expect(cache.checkAndStore('bot-123', 'nonce4', now)).toBe(true);
  });

  test('rejects stale nonce', () => {
    const old = Date.now() - NONCE_TTL_MS - 1000;
    expect(
      cache.checkAndStore('bot-123', 'nonce5', old)
    ).toBe(false);
  });

  test('accepts same nonce for different agents', () => {
    const now = Date.now();
    cache.checkAndStore('bot-abc', 'nonce6', now);
    expect(cache.checkAndStore('bot-xyz', 'nonce6', now)).toBe(true);
  });
});
