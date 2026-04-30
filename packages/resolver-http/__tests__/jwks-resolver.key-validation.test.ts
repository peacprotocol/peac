// JWKS key validation tests (Commit 3.1 Fix #1).
//
// resolver-http now calls importJwkAsEd25519 on the matched JWK before
// caching/returning it. Structurally plausible but cryptographically
// invalid keys are rejected with jwks_invalid_shape and NOT cached.

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

import { IssuerJwksResolver } from '../src/jwks-resolver.js';

beforeEach(() => {
  resetMock();
  mockSafeFetchJWKS.mockClear();
});

// A real Ed25519 public-key x value (32 bytes base64url-encoded; no padding).
// 'AAAA...' decodes to 32 zero bytes ; crypto.subtle accepts this as a JWK
// shape, which is sufficient to confirm the import path validates the key
// material structurally.
const VALID_ED25519_X = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('jwks-resolver key validation (Commit 3.1 Fix #1)', () => {
  it('valid Ed25519 JWK succeeds and is cached', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: {
        keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: VALID_ED25519_X }],
      },
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(result.ok).toBe(true);
    expect(resolver.cacheSize).toBe(1);
  });

  it('structurally plausible but cryptographically invalid Ed25519 key (wrong x length) is rejected', async () => {
    // x must be 32 bytes (~43 base64url chars). 'short' decodes to 3 bytes.
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: 'short' }] },
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
    // Critically: the invalid key was NOT cached
    expect(resolver.cacheSize).toBe(0);
  });

  it('wrong curve (Ed448 in OKP) is rejected by importJwkAsEd25519', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: {
        keys: [{ kty: 'OKP', crv: 'Ed448', kid: 'k1', x: VALID_ED25519_X }],
      },
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
    expect(resolver.cacheSize).toBe(0);
  });

  it('wrong key type (RSA shape with kty=OKP) is rejected', async () => {
    // Garbage x with wrong padding/length. crypto.subtle.importKey('jwk', ...)
    // throws on shape mismatch.
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: '!!!@@@###' }] },
    });
    const resolver = new IssuerJwksResolver();
    const result = await resolver.resolve(
      'https://issuer.example.com',
      'https://issuer.example.com/jwks',
      'k1'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jwks_invalid_shape');
  });
});
