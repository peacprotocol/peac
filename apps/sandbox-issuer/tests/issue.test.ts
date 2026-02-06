/**
 * Issue endpoint tests
 *
 * Tests the POST /api/v1/issue flow including request validation,
 * receipt issuance, and round-trip verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import { verify } from '@peac/crypto';
import { resolveKeys, resetKeyCache } from '../src/keys.js';
import { resetRateLimitStore } from '../src/middleware/rate-limit.js';

const TEST_ISSUER_URL = 'https://test-issuer.example.com';

function req(body: unknown, headers?: Record<string, string>) {
  return new Request('http://localhost/api/v1/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/issue', () => {
  beforeEach(() => {
    resetKeyCache();
    resetRateLimitStore();
    process.env.PEAC_ISSUER_URL = TEST_ISSUER_URL;
  });

  afterEach(() => {
    delete process.env.PEAC_ISSUER_URL;
  });

  it('should issue a valid receipt', async () => {
    const res = await app.fetch(req({ aud: 'https://example.com' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.receipt).toBeDefined();
    expect(data.receipt_id).toBeDefined();
    expect(data.issuer).toBe('https://test-issuer.example.com');
    expect(data.key_id).toBeDefined();
  });

  it('should verify the issued receipt round-trip', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ aud: 'https://example.com' }));
    const data = await res.json();

    const result = await verify(data.receipt, keys.publicKey);
    expect(result.valid).toBe(true);
    expect(result.payload).toMatchObject({
      iss: 'https://test-issuer.example.com',
      aud: 'https://example.com',
    });
  });

  it('should include sub when provided', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ aud: 'https://example.com', sub: 'user-123' }));
    const data = await res.json();

    const result = await verify(data.receipt, keys.publicKey);
    expect(result.valid).toBe(true);
    expect((result.payload as Record<string, unknown>).sub).toBe('user-123');
  });

  it('should include purpose_declared when purpose provided', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ aud: 'https://example.com', purpose: 'test-access' }));
    const data = await res.json();

    const result = await verify(data.receipt, keys.publicKey);
    expect(result.valid).toBe(true);
    expect((result.payload as Record<string, unknown>).purpose_declared).toEqual(['test-access']);
  });

  it('should respect custom expires_in', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ aud: 'https://example.com', expires_in: 600 }));
    const data = await res.json();

    const result = await verify(data.receipt, keys.publicKey);
    expect(result.valid).toBe(true);
    const payload = result.payload as Record<string, unknown>;
    expect((payload.exp as number) - (payload.iat as number)).toBe(600);
  });

  it('should reject missing aud', async () => {
    const res = await app.fetch(req({}));
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.type).toContain('validation_error');
  });

  it('should reject invalid aud URL', async () => {
    const res = await app.fetch(req({ aud: 'not-a-url' }));
    expect(res.status).toBe(422);
  });

  it('should reject unknown fields (strict schema)', async () => {
    const res = await app.fetch(req({ aud: 'https://example.com', arbitrary_claim: 'value' }));
    expect(res.status).toBe(422);
  });

  it('should reject expires_in exceeding 24h', async () => {
    const res = await app.fetch(req({ aud: 'https://example.com', expires_in: 86401 }));
    expect(res.status).toBe(422);
  });

  it('should reject non-JSON body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json',
      })
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.type).toContain('invalid_request');
  });

  it('should reject oversized body via content-length', async () => {
    const res = await app.fetch(
      req({ aud: 'https://example.com' }, { 'content-length': '999999' })
    );
    expect(res.status).toBe(413);
  });

  it('should set security headers on response', async () => {
    const res = await app.fetch(req({ aud: 'https://example.com' }));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });
});
