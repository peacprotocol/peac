// jwks-resolver no-throw invariant.
// Missing kid / malformed JWKS / network failure / pre-check rejection
// NEVER throw; always discriminated-union failure.

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

import { fetchAndValidateJwks, IssuerJwksResolver, findKeyByKid } from '../src/jwks-resolver.js';

beforeEach(() => {
  resetMock();
});

describe('jwks-resolver no-throw invariant', () => {
  it('missing kid never throws', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { keys: [] },
    });
    const resolver = new IssuerJwksResolver();
    await expect(
      resolver.resolve('https://issuer.example.com', 'https://issuer.example.com/jwks', 'absent')
    ).resolves.toBeDefined();
  });

  it('malformed JWKS body never throws', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { not_keys: 'malformed' },
    });
    await expect(fetchAndValidateJwks('https://issuer.example.com/jwks')).resolves.toBeDefined();
  });

  it('network failure never throws', async () => {
    enqueue('safeFetchJWKS', { ok: false, code: NET_CODES.E_NETWORK_ERROR });
    await expect(fetchAndValidateJwks('https://issuer.example.com/jwks')).resolves.toBeDefined();
  });

  it('pre-fetch URL rejection (metadata-IP) never throws', async () => {
    await expect(fetchAndValidateJwks('https://169.254.169.254/jwks')).resolves.toBeDefined();
  });

  it('non-HTTPS URL never throws', async () => {
    await expect(fetchAndValidateJwks('http://issuer.example.com/jwks')).resolves.toBeDefined();
  });

  it('malformed jwks_uri never throws', async () => {
    await expect(fetchAndValidateJwks('not-a-url')).resolves.toBeDefined();
  });

  it('malformed issuer URL in resolve() never throws', async () => {
    const resolver = new IssuerJwksResolver();
    await expect(
      resolver.resolve('not-a-url', 'https://issuer.example.com/jwks', 'k1')
    ).resolves.toBeDefined();
  });

  it('findKeyByKid with empty JWKS returns null, does not throw', () => {
    expect(findKeyByKid({ keys: [] }, 'k1')).toBeNull();
  });
});
