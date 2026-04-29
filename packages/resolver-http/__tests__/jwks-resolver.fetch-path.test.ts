// JWKS fetch-path test (Plan Fix #3).
// Asserts the network fetch goes through fetchJwksSafe (net-node-backed),
// NOT through @peac/jwks-cache.resolveKey (which uses global fetch).

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

import { IssuerJwksResolver, fetchAndValidateJwks } from '../src/jwks-resolver.js';

beforeEach(() => {
  resetMock();
  mockSafeFetchJWKS.mockClear();
});

const VALID_JWKS = {
  keys: [
    { kty: 'OKP', crv: 'Ed25519', kid: 'k1', x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo' },
  ],
};

describe('jwks-resolver fetch-path: routes through fetchJwksSafe (Plan Fix #3)', () => {
  it('safeFetchJWKS mock is called once per cache miss', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    const resolver = new IssuerJwksResolver();
    await resolver.resolve('https://issuer.example.com', 'https://issuer.example.com/jwks', 'k1');
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(1);
  });

  it('fetchAndValidateJwks calls safeFetchJWKS, not safeFetchJson or safeFetchRaw', async () => {
    enqueue('safeFetchJWKS', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: VALID_JWKS,
    });
    await fetchAndValidateJwks('https://issuer.example.com/jwks');
    expect(mockSafeFetchJWKS).toHaveBeenCalledTimes(1);
    expect(mockSafeFetchJson).not.toHaveBeenCalled();
    expect(mockSafeFetchRaw).not.toHaveBeenCalled();
  });

  it('jwks-resolver source does NOT import resolveKey or createResolver from @peac/jwks-cache', async () => {
    // Read the source file and assert no resolveKey / createResolver references.
    // (Defense-in-depth: the build-time isolation gate covers @peac/protocol;
    // this test catches accidental jwks-cache.resolveKey usage in resolver-http source.)
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../src/jwks-resolver.ts'), 'utf8');
    // Strip comments before scanning so doctrine prose like "MUST NOT call resolveKey"
    // doesn't false-flag.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Match actual function calls only.
    expect(/\bresolveKey\s*\(/.test(stripped), 'resolveKey() should not be called').toBe(false);
    expect(/\bcreateResolver\s*\(/.test(stripped), 'createResolver() should not be called').toBe(
      false
    );
  });
});
