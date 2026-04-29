// Cache isolation: two issuers with overlapping kids resolve to distinct keys.
// Cache key is keyed by issuer origin via buildCacheKey.

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

const ALPHA_X = '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo';
const BETA_X = '0CkahJv_36-58FvSBTLkQ8nAcBd5lMJpaH4yj7BD5Hk';

describe('jwks-resolver cache isolation', () => {
  it('two issuers with overlapping kid k1 resolve to distinct keys', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: BETA_X }] },
    });

    const resolver = new IssuerJwksResolver();
    const a = await resolver.resolve(
      'https://alpha.example.com',
      'https://alpha.example.com/jwks',
      'k1'
    );
    const b = await resolver.resolve(
      'https://beta.example.com',
      'https://beta.example.com/jwks',
      'k1'
    );

    expect(a.ok && a.jwk.x).toBe(ALPHA_X);
    expect(b.ok && b.jwk.x).toBe(BETA_X);
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(2);
    // Cache is populated for both
    expect(resolver.cacheSize).toBe(2);
  });

  it('repeated resolve for the same (issuer, kid) hits cache', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    const resolver = new IssuerJwksResolver();
    const r1 = await resolver.resolve(
      'https://alpha.example.com',
      'https://alpha.example.com/jwks',
      'k1'
    );
    const r2 = await resolver.resolve(
      'https://alpha.example.com',
      'https://alpha.example.com/jwks',
      'k1'
    );
    expect(r1.ok && r1.jwk.x).toBe(ALPHA_X);
    expect(r2.ok && r2.jwk.x).toBe(ALPHA_X);
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(1);
  });

  it('different resolver instances do not share cache state', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    const r1 = new IssuerJwksResolver();
    const r2 = new IssuerJwksResolver();
    await r1.resolve('https://alpha.example.com', 'https://alpha.example.com/jwks', 'k1');
    await r2.resolve('https://alpha.example.com', 'https://alpha.example.com/jwks', 'k1');
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(2); // each resolver fetched
    expect(r1.cacheSize).toBe(1);
    expect(r2.cacheSize).toBe(1);
  });

  it('clearCache empties the resolver', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [{ kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: ALPHA_X }] },
    });
    const resolver = new IssuerJwksResolver();
    await resolver.resolve('https://alpha.example.com', 'https://alpha.example.com/jwks', 'k1');
    expect(resolver.cacheSize).toBe(1);
    resolver.clearCache();
    expect(resolver.cacheSize).toBe(0);
    // Next resolve fires another fetch
    await resolver.resolve('https://alpha.example.com', 'https://alpha.example.com/jwks', 'k1');
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(2);
  });
});
