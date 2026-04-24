/**
 * Legacy /verify alias: pre-Sunset runtime responsiveness.
 *
 * The alias MUST remain runtime-reachable through the advertised Sunset
 * date (Sat, 01 Nov 2026 00:00:00 GMT, RFC 8594). For the same input,
 * the alias MUST return the same response shape and status code as the
 * canonical `POST /v1/verify`. The alias differs only in the
 * deprecation-header set stamped on every response.
 *
 * This test drives the alias and the canonical route with identical
 * inputs and asserts both the status-code parity and the shape of the
 * response body, across a success-adjacent path (the request is parsed
 * and reaches the verifier layer) and an error path (malformed input).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import {
  createVerifyV1Handler,
  resetVerifyV1RateLimit,
  isProblemError,
  PROBLEM_MEDIA_TYPE,
  LEGACY_VERIFY_DEPRECATION_HEADERS,
} from '../src/index.js';

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
  const verifyV1 = createVerifyV1Handler();
  app.post('/v1/verify', verifyV1);
  app.post('/verify', (c) => {
    for (const [k, v] of Object.entries(LEGACY_VERIFY_DEPRECATION_HEADERS)) c.header(k, v);
    return verifyV1(c);
  });
  return app;
}

function request(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('legacy /verify alias — pre-Sunset responsiveness', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it('Sunset header value is exactly the advertised date', async () => {
    const res = await app.request(request('/verify', { receipt: 'not-a-jws' }));
    expect(res.headers.get('Sunset')).toBe('Sat, 01 Nov 2026 00:00:00 GMT');
  });

  it('alias and canonical return identical status codes on invalid input', async () => {
    const aliasRes = await app.request(request('/verify', { receipt: 'not-a-jws' }));
    const canonRes = await app.request(request('/v1/verify', { receipt: 'not-a-jws' }));
    expect(aliasRes.status).toBe(canonRes.status);
  });

  it('alias and canonical return identical response shape on invalid input', async () => {
    const aliasRes = await app.request(request('/verify', { receipt: 'not-a-jws' }));
    const canonRes = await app.request(request('/v1/verify', { receipt: 'not-a-jws' }));

    const aliasBody = await aliasRes.json();
    const canonBody = await canonRes.json();

    // Both paths return RFC 9457 Problem Details. Compare the set of
    // keys (values that would drift per-request, e.g. peac_trace_id, are
    // allowed to differ).
    expect(Object.keys(aliasBody).sort()).toEqual(Object.keys(canonBody).sort());
    expect(aliasBody.type).toBe(canonBody.type);
    expect(aliasBody.title).toBe(canonBody.title);
    expect(aliasBody.status).toBe(canonBody.status);
  });

  it('alias and canonical agree on RFC 9457 Content-Type for error bodies', async () => {
    const aliasRes = await app.request(request('/verify', { receipt: 'not-a-jws' }));
    const canonRes = await app.request(request('/v1/verify', { receipt: 'not-a-jws' }));
    const aliasCt = aliasRes.headers.get('Content-Type') ?? '';
    const canonCt = canonRes.headers.get('Content-Type') ?? '';
    // Both should start with application/problem+json (may or may not have charset)
    expect(aliasCt.split(';')[0]).toBe(canonCt.split(';')[0]);
  });

  it('alias is reachable with malformed JSON (returns 400 Problem Details)', async () => {
    const badReq = new Request('http://localhost/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const res = await app.request(badReq);
    // We don't assert the exact status; only that the alias responded
    // (did not hang, did not throw uncaught) and stamped deprecation.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get('Sunset')).toBe('Sat, 01 Nov 2026 00:00:00 GMT');
    expect(res.headers.get('Deprecation')).toBe('true');
  });
});
