// pointer-fetch malformed-body cases (Plan Fix #1: pointer_malformed_jws).
// Empty body / non-3-segment / non-base64url all surface pointer_malformed_jws,
// NOT pointer_digest_mismatch and NOT discovery_invalid_shape.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
} from './_helpers/mock-net-node.js';

vi.mock('@peac/net-node', async () => {
  const actual = await vi.importActual<typeof import('@peac/net-node')>('@peac/net-node');
  return {
    ...actual,
    safeFetchJson: mockSafeFetchJson,
    safeFetchJWKS: mockSafeFetchJWKS,
    safeFetchRaw: mockSafeFetchRaw,
  };
});

import { fetchPointerWithDigest } from '../src/pointer-fetch.js';

const ANY_DIGEST = '0'.repeat(64);

beforeEach(() => {
  resetMock();
});

describe('pointer-fetch malformed body', () => {
  it('empty body surfaces pointer_malformed_jws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      bytes: new Uint8Array(0),
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('one-segment body surfaces pointer_malformed_jws (not 3-segment)', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'oneSegment',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('two-segment body surfaces pointer_malformed_jws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'seg1.seg2',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('four-segment body surfaces pointer_malformed_jws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'seg1.seg2.seg3.seg4',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('non-base64url chars in segments surfaces pointer_malformed_jws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'seg!1.seg@2.seg#3',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('whitespace-only body surfaces pointer_malformed_jws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: '   ',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_malformed_jws');
  });

  it('malformed body codes are NOT discovery_invalid_shape (Plan Fix #1)', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'seg1.seg2',
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).not.toBe('discovery_invalid_shape');
      expect(result.code).not.toBe('pointer_digest_mismatch');
    }
  });
});
