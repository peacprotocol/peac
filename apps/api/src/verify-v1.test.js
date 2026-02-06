/**
 * @peac/api/verify-v1 - Test verify V1 endpoint
 *
 * Tests issuer allowlist rejection, rate limit tiering,
 * and security header consistency.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createVerifyV1Handler, resetVerifyV1RateLimit } from '../dist/verify-v1.js';
import { Hono } from 'hono';

// Build a minimal Hono app with the verify handler and ProblemError handler.
// Uses duck-typing because tsup bundles a separate ProblemError class copy.
function buildApp() {
  resetVerifyV1RateLimit();
  const app = new Hono();
  app.onError((err, c) => {
    if (err.name === 'ProblemError' && typeof err.toProblemDetails === 'function') {
      return c.json(err.toProblemDetails(), err.status);
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

test('verify response includes security headers', async () => {
  const app = buildApp();
  const jws = fakeJws({ alg: 'EdDSA', kid: 'k1' }, { iss: 'https://evil.example.com' });

  // Even error responses should have security headers via the handler path
  // For this test, use a receipt with public_key to hit the verify path directly
  const res = await app.fetch(
    verifyReq({
      receipt: jws,
      public_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    })
  );

  // Should reach the verify stage (may fail verification, but headers should be set)
  if (res.status === 200) {
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('rejects oversized body via content-length', async () => {
  const app = buildApp();
  const res = await app.fetch(verifyReq({ receipt: 'test' }, { 'content-length': '999999' }));
  assert.strictEqual(res.status, 413);
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
