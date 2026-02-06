/**
 * @peac/api/verify-v1 - Test verify V1 endpoint
 *
 * Tests issuer allowlist rejection, rate limit tiering,
 * RFC 9457 Content-Type enforcement, and security header consistency.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  createVerifyV1Handler,
  resetVerifyV1RateLimit,
  isProblemError,
  PROBLEM_MEDIA_TYPE,
} from '../dist/index.js';
import { Hono } from 'hono';

// Build a minimal Hono app with the verify handler and ProblemError handler.
// Uses isProblemError() for duck-typed detection across bundle boundaries.
function buildApp() {
  resetVerifyV1RateLimit();
  const app = new Hono();
  app.onError((err, c) => {
    if (isProblemError(err)) {
      c.header('Content-Type', PROBLEM_MEDIA_TYPE);
      return c.body(JSON.stringify(err.toProblemDetails()), err.status);
    }
    return c.json({ title: 'Internal Server Error', status: 500 }, 500);
  });
  app.post('/api/v1/verify', createVerifyV1Handler());
  return app;
}

function verifyReq(body, headers = {}) {
  return new Request('http://localhost/api/v1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Craft a fake JWS with controlled header/payload (signature will be invalid)
function fakeJws(headerObj, payloadObj) {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${enc(headerObj)}.${enc(payloadObj)}.fake-sig`;
}

test('rejects receipt with unknown issuer before JWKS fetch', async () => {
  const app = buildApp();
  const jws = fakeJws(
    { alg: 'EdDSA', kid: 'key-1' },
    { iss: 'https://evil.example.com', aud: 'https://example.com' }
  );

  const res = await app.fetch(verifyReq({ receipt: jws }));
  const data = await res.json();

  assert.strictEqual(res.status, 422);
  assert.strictEqual(data.title, 'Untrusted Issuer');
  assert.ok(data.detail.includes('not in the trusted issuers allowlist'));
});

test('rejects receipt missing iss claim for JWKS mode', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'key-1' }, { aud: 'https://example.com' });

  const res = await app.fetch(verifyReq({ receipt: jws }));
  const data = await res.json();

  assert.strictEqual(res.status, 422);
  assert.strictEqual(data.title, 'Missing Issuer or Key ID');
});

test('rejects receipt missing kid header for JWKS mode', async () => {
  const app = buildApp();
  const jws = fakeJws(
    { alg: 'EdDSA' },
    { iss: 'https://sandbox.peacprotocol.org', aud: 'https://example.com' }
  );

  const res = await app.fetch(verifyReq({ receipt: jws }));
  const data = await res.json();

  assert.strictEqual(res.status, 422);
  assert.strictEqual(data.title, 'Missing Issuer or Key ID');
});

test('anonymous rate limit (100/min) enforced', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // Exhaust 100 anonymous requests
  for (let i = 0; i < 100; i++) {
    await app.fetch(verifyReq({ receipt: jws }));
  }

  // 101st should be rate limited
  const res = await app.fetch(verifyReq({ receipt: jws }));
  assert.strictEqual(res.status, 429);

  const data = await res.json();
  assert.strictEqual(data.title, 'Rate Limited');
  assert.ok(res.headers.get('retry-after'));
});

test('API key rate limit (1000/min) is separate from anonymous', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // Exhaust 100 anonymous requests
  for (let i = 0; i < 100; i++) {
    await app.fetch(verifyReq({ receipt: jws }));
  }

  // Anonymous is now rate-limited
  const anonRes = await app.fetch(verifyReq({ receipt: jws }));
  assert.strictEqual(anonRes.status, 429);

  // API key should still work (separate bucket)
  const apiRes = await app.fetch(verifyReq({ receipt: jws }, { 'x-api-key': 'test-key-123' }));
  assert.notStrictEqual(apiRes.status, 429);
});

test('error responses include security headers', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // Error responses (thrown ProblemError) must include security headers
  const res = await app.fetch(verifyReq({ receipt: jws }));
  assert.strictEqual(res.status, 422);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('cache-control'), 'no-store');
  assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
  assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
});

test('thrown ProblemError returns application/problem+json Content-Type', async () => {
  const app = buildApp();
  const jws = fakeJws(
    { alg: 'EdDSA', kid: 'key-1' },
    { iss: 'https://evil.example.com', aud: 'https://example.com' }
  );

  // Thrown ProblemError (untrusted issuer) caught by onError
  const res = await app.fetch(verifyReq({ receipt: jws }));
  assert.strictEqual(res.status, 422);
  assert.ok(
    res.headers.get('content-type')?.includes('application/problem+json'),
    `Expected application/problem+json, got: ${res.headers.get('content-type')}`
  );
});

test('early-return error (rate limit) returns application/problem+json Content-Type', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // Exhaust rate limit
  for (let i = 0; i < 100; i++) {
    await app.fetch(verifyReq({ receipt: jws }));
  }

  // Rate limit is early-return (not thrown), must still have problem+json
  const res = await app.fetch(verifyReq({ receipt: jws }));
  assert.strictEqual(res.status, 429);
  assert.ok(
    res.headers.get('content-type')?.includes('application/problem+json'),
    `Expected application/problem+json, got: ${res.headers.get('content-type')}`
  );
});

test('early-return error (oversized body) returns application/problem+json Content-Type', async () => {
  const app = buildApp();
  const res = await app.fetch(verifyReq({ receipt: 'test' }, { 'content-length': '999999' }));
  assert.strictEqual(res.status, 413);
  assert.ok(
    res.headers.get('content-type')?.includes('application/problem+json'),
    `Expected application/problem+json, got: ${res.headers.get('content-type')}`
  );
});

test('rejects invalid public_key length', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA' }, { iss: 'https://example.com' });

  const res = await app.fetch(
    verifyReq({
      receipt: jws,
      public_key: 'dG9vc2hvcnQ', // "tooshort" - not 32 bytes
    })
  );
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.strictEqual(data.title, 'Invalid Public Key');
});

test('rate limit includes RateLimit-* headers (RFC 9333)', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // First request should include rate limit headers
  const res = await app.fetch(verifyReq({ receipt: jws }));
  assert.ok(res.headers.get('ratelimit-limit'), 'Expected RateLimit-Limit header');
  assert.ok(res.headers.get('ratelimit-remaining'), 'Expected RateLimit-Remaining header');
  assert.ok(res.headers.get('ratelimit-reset'), 'Expected RateLimit-Reset header');

  // Remaining should decrease
  const remaining1 = parseInt(res.headers.get('ratelimit-remaining'));
  const res2 = await app.fetch(verifyReq({ receipt: jws }));
  const remaining2 = parseInt(res2.headers.get('ratelimit-remaining'));
  assert.ok(remaining2 < remaining1, 'RateLimit-Remaining should decrease');
});
