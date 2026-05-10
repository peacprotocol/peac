/**
 * Rate limiting tests
 *
 * Tests the in-memory sliding window rate limiter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import { resetRateLimitStore } from '../src/middleware/rate-limit.js';
import { resetKeyCache } from '../src/keys.js';

const TEST_ISSUER_URL = 'https://test-issuer.example.com';

function issueReq(headers?: Record<string, string>) {
  return new Request('http://localhost/api/v1/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ sub: 'https://example.com' }),
  });
}

/**
 * Sequentially exhaust the in-memory rate-limit window without parallelizing
 * requests. The sliding-window limiter is timing-sensitive, so callers that
 * exhaust the window or assert ordering must keep using sequential awaits;
 * Promise.all-style parallelism would race the bucket bookkeeping and
 * produce non-deterministic results.
 */
async function exhaustLimit(headers?: Record<string, string>, count = 1000): Promise<void> {
  for (let i = 0; i < count; i++) {
    await app.fetch(issueReq(headers));
  }
}

describe('Rate limiting', () => {
  beforeEach(() => {
    resetRateLimitStore();
    resetKeyCache();
    process.env.PEAC_ISSUER_URL = TEST_ISSUER_URL;
  });

  afterEach(() => {
    delete process.env.PEAC_TRUST_PROXY;
    delete process.env.PEAC_ISSUER_URL;
  });

  it('should allow requests within the limit', async () => {
    const res = await app.fetch(issueReq());
    expect(res.status).toBe(200);
  });

  it('should return 429 when limit is exceeded', async () => {
    // Send 1001 requests -- the 1001st should be rate-limited
    // For speed, we test the boundary by sending many requests
    const promises: Promise<Response>[] = [];
    for (let i = 0; i < 1001; i++) {
      promises.push(app.fetch(issueReq()));
    }
    const responses = await Promise.all(promises);

    const codes = responses.map((r) => r.status);
    expect(codes.filter((c) => c === 200).length).toBe(1000);
    expect(codes.filter((c) => c === 429).length).toBe(1);
  });

  it('should include Retry-After header on 429', async () => {
    await exhaustLimit();

    const res = await app.fetch(issueReq());
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeDefined();

    const body = await res.json();
    expect(body.type).toContain('rate_limited');
    expect(body.status).toBe(429);
  });

  it('should use RFC 9457 Problem Details format for 429', async () => {
    await exhaustLimit();

    const res = await app.fetch(issueReq());
    const body = await res.json();
    expect(body.type).toBe('https://www.peacprotocol.org/errors/rate_limited');
    expect(body.title).toBe('Rate Limited');
    expect(body.status).toBe(429);
    expect(body.detail).toBeDefined();
  });

  it('should reset after resetRateLimitStore()', async () => {
    await exhaustLimit();

    const blocked = await app.fetch(issueReq());
    expect(blocked.status).toBe(429);

    resetRateLimitStore();

    const allowed = await app.fetch(issueReq());
    expect(allowed.status).toBe(200);
  });

  it('should ignore x-forwarded-for when PEAC_TRUST_PROXY is not set', async () => {
    // Without PEAC_TRUST_PROXY, two different x-forwarded-for IPs should
    // share the same rate limit bucket (both map to 127.0.0.1)
    await exhaustLimit({ 'x-forwarded-for': '10.0.0.1' });

    // Even with a different forwarded IP, should be rate-limited (same bucket)
    const res = await app.fetch(issueReq({ 'x-forwarded-for': '10.0.0.2' }));
    expect(res.status).toBe(429);
  });

  it('should respect x-forwarded-for when PEAC_TRUST_PROXY=1', async () => {
    process.env.PEAC_TRUST_PROXY = '1';

    // Exhaust limit for IP 10.0.0.1
    await exhaustLimit({ 'x-forwarded-for': '10.0.0.1' });

    // 10.0.0.1 is now rate-limited
    const blockedRes = await app.fetch(issueReq({ 'x-forwarded-for': '10.0.0.1' }));
    expect(blockedRes.status).toBe(429);

    // Different IP should still be allowed (separate bucket)
    const allowedRes = await app.fetch(issueReq({ 'x-forwarded-for': '10.0.0.2' }));
    expect(allowedRes.status).toBe(200);
  });
});
