// JWKS resolver smoke test.
// Issuer URL + jwks_uri + kid → resolves to a JWK; second call hits cache.

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

import { IssuerJwksResolver, fetchAndValidateJwks, findKeyByKid } from '../src/jwks-resolver.js';

beforeEach(() => {
  resetMock();
  mockSafeFetchJWKS.mockClear();
});

const VALID_JWKS = {
  keys: [
    {
      kty: 'OKP',
      crv: 'Ed25519',
      kid: 'k1',
      x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      alg: 'EdDSA',
      use: 'sig',
    },
  ],
};

describe('jwks-resolver smoke', () => {
  it('fetchAndValidateJwks returns parsed JWKS on happy path', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    const result = await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jwks.keys).toHaveLength(1);
      expect(result.jwks.keys[0].kid).toBe('k1');
    }
  });

  it('findKeyByKid returns the right key', () => {
    const found = findKeyByKid(VALID_JWKS, 'k1');
    expect(found?.kid).toBe('k1');
    expect(findKeyByKid(VALID_JWKS, 'absent')).toBeNull();
  });

  it('IssuerJwksResolver.resolve returns the matched JWK on first call', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jwk.kid).toBe('k1');
    }
  });

  it('second call hits cache (no second upstream fetch)', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    const resolver = new IssuerJwksResolver();
    const a = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(a.ok).toBe(true);
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(1);

    const b = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(b.ok).toBe(true);
    // Still 1 — second call served from cache.
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(1);
  });

  it('kid-not-found surfaces jwks_kid_not_found', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'absent-kid'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_kid_not_found');
  });
});
