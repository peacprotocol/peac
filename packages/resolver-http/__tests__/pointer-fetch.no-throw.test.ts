// pointer-fetch no-throw invariant.
// Empty body / malformed / digest mismatch / network failure / unexpected
// upstream errors NEVER throw; always discriminated-union failure.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  NET_CODES,
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

describe('pointer-fetch no-throw invariant', () => {
  it('empty body never throws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      bytes: new Uint8Array(0),
    });
    await expect(
      fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST)
    ).resolves.toBeDefined();
  });

  it('malformed body never throws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'not-a-valid-jws',
    });
    await expect(
      fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST)
    ).resolves.toBeDefined();
  });

  it('digest mismatch never throws', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: 'aGVhZGVy.cGF5bG9hZA.c2lnbmF0dXJl',
    });
    await expect(
      fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST)
    ).resolves.toBeDefined();
  });

  it('network failure never throws', async () => {
    enqueue('safeFetchRaw', { ok: false, code: NET_CODES.E_NETWORK_ERROR });
    await expect(
      fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST)
    ).resolves.toBeDefined();
  });

  it('non-HTTPS URL never throws', async () => {
    await expect(
      fetchPointerWithDigest('http://issuer.example.com/r', ANY_DIGEST)
    ).resolves.toBeDefined();
  });

  it('malformed URL never throws', async () => {
    await expect(fetchPointerWithDigest('not-a-url', ANY_DIGEST)).resolves.toBeDefined();
  });

  it('invalid expected-digest format never throws', async () => {
    await expect(
      fetchPointerWithDigest('https://issuer.example.com/r', 'bad')
    ).resolves.toBeDefined();
  });

  it('uppercase hex expected digest is rejected (lowercase rule) without throwing', async () => {
    const upper = 'A'.repeat(64);
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', upper);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_fetch_blocked');
  });
});
