/**
 * Legacy /verify alias: deprecation-header contract.
 *
 * The reference verifier keeps `POST /verify` runtime-reachable as a
 * deprecated compatibility alias. Every response (success or error)
 * MUST carry:
 *
 *   - `Deprecation: true`                               (RFC 9745)
 *   - `Sunset: Sat, 01 Nov 2026 00:00:00 GMT`           (RFC 8594)
 *   - `Link: <https://www.peacprotocol.org/docs/migration>; rel="deprecation"` (RFC 8288)
 *
 * The same is true for the `/api/v1/verify` alias. This test exercises
 * the alias routes directly in a minimal Hono app that wires the alias
 * handler the same way the real server does.
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
  app.post('/api/v1/verify', (c) => {
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

describe('legacy /verify alias: deprecation headers', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it('exposes the full deprecation header set as a named constant', () => {
    expect(LEGACY_VERIFY_DEPRECATION_HEADERS.Deprecation).toBe('true');
    expect(LEGACY_VERIFY_DEPRECATION_HEADERS.Sunset).toBe('Sat, 01 Nov 2026 00:00:00 GMT');
    expect(LEGACY_VERIFY_DEPRECATION_HEADERS.Link).toBe(
      '<https://www.peacprotocol.org/docs/migration>; rel="deprecation"'
    );
  });

  it('stamps all three headers on a /verify error response', async () => {
    const res = await app.request(request('/verify', { receipt: 'not-a-jws' }));
    expect(res.headers.get('Deprecation')).toBe('true');
    expect(res.headers.get('Sunset')).toBe('Sat, 01 Nov 2026 00:00:00 GMT');
    expect(res.headers.get('Link')).toBe(
      '<https://www.peacprotocol.org/docs/migration>; rel="deprecation"'
    );
  });

  it('stamps all three headers on an /api/v1/verify error response', async () => {
    const res = await app.request(request('/api/v1/verify', { receipt: 'not-a-jws' }));
    expect(res.headers.get('Deprecation')).toBe('true');
    expect(res.headers.get('Sunset')).toBe('Sat, 01 Nov 2026 00:00:00 GMT');
    expect(res.headers.get('Link')).toBe(
      '<https://www.peacprotocol.org/docs/migration>; rel="deprecation"'
    );
  });

  it('canonical /v1/verify response does NOT carry deprecation headers', async () => {
    const res = await app.request(request('/v1/verify', { receipt: 'not-a-jws' }));
    expect(res.headers.get('Deprecation')).toBeNull();
    expect(res.headers.get('Sunset')).toBeNull();
    expect(res.headers.get('Link')).toBeNull();
  });
});
