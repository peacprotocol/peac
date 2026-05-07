/**
 * Issue endpoint tests
 *
 * Tests the POST /api/v1/issue flow including request validation,
 * record issuance, and round-trip verification using verifyLocal()
 * from @peac/protocol.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import { verifyLocal } from '@peac/protocol';
import { resolveKeys, resetKeyCache } from '../src/keys.js';
import { resetRateLimitStore } from '../src/middleware/rate-limit.js';

const TEST_ISSUER_URL = 'https://test-issuer.example.com';
const TEST_SUBJECT = 'https://example.com';

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

  it('should issue a valid record', async () => {
    const res = await app.fetch(req({ sub: TEST_SUBJECT }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.receipt).toBeDefined();
    expect(data.receipt_id).toBeDefined();
    expect(data.issuer).toBe(TEST_ISSUER_URL);
    expect(data.key_id).toBeDefined();
  });

  it('should verify the issued record round-trip', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ sub: TEST_SUBJECT }));
    const data = await res.json();

    const result = await verifyLocal(data.receipt, keys.publicKey, { issuer: TEST_ISSUER_URL });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.iss).toBe(TEST_ISSUER_URL);
    expect(result.claims.sub).toBe(TEST_SUBJECT);
    expect(result.claims.kind).toBe('evidence');
    expect(result.claims.type).toBe('org.example/sandbox-test');
    expect(result.claims.jti).toBe(data.receipt_id);
    expect(result.warnings.some((w) => w.code === 'type_unregistered')).toBe(true);
  });

  it('should include sub in record claims', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ sub: 'https://subject.example.com/user-123' }));
    const data = await res.json();

    const result = await verifyLocal(data.receipt, keys.publicKey, { issuer: TEST_ISSUER_URL });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.sub).toBe('https://subject.example.com/user-123');
  });

  it('should set purpose_declared as a string when purpose is provided', async () => {
    const keys = await resolveKeys();
    const res = await app.fetch(req({ sub: TEST_SUBJECT, purpose: 'test-access' }));
    const data = await res.json();

    const result = await verifyLocal(data.receipt, keys.publicKey, { issuer: TEST_ISSUER_URL });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.claims.purpose_declared).toBe('test-access');
  });

  it('should reject missing sub', async () => {
    const res = await app.fetch(req({}));
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.type).toContain('validation_error');
  });

  it('should reject invalid sub URL', async () => {
    const res = await app.fetch(req({ sub: 'not-a-url' }));
    expect(res.status).toBe(422);
  });

  it('should reject unknown fields (strict schema)', async () => {
    const res = await app.fetch(req({ sub: TEST_SUBJECT, arbitrary_claim: 'value' }));
    expect(res.status).toBe(422);
  });

  it('should reject legacy aud field', async () => {
    const res = await app.fetch(req({ sub: TEST_SUBJECT, aud: TEST_SUBJECT }));
    expect(res.status).toBe(422);
  });

  it('should reject expires_in with stable detail', async () => {
    const res = await app.fetch(req({ sub: TEST_SUBJECT, expires_in: 600 }));
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.detail).toContain('expires_in is not supported for current Wire records');
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
    const res = await app.fetch(req({ sub: TEST_SUBJECT }, { 'content-length': '999999' }));
    expect(res.status).toBe(413);
  });

  it('should set security headers on response', async () => {
    const res = await app.fetch(req({ sub: TEST_SUBJECT }));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
  });

  it('should return Problem Details when issuer configuration is not canonical', async () => {
    process.env.PEAC_ISSUER_URL = 'http://not-canonical.example.com';

    const res = await app.fetch(req({ sub: TEST_SUBJECT }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.type).toContain('validation_error');
    expect(data.detail).toContain('iss is not in canonical form');
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('stack');
  });
});
