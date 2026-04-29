// Discovery no-throw invariant tests.
// All malformed input / unexpected upstream errors return discriminated-union
// failure; never throw to the caller.

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

import { fetchIssuerConfig } from '../src/discovery.js';

beforeEach(() => {
  resetMock();
});

describe('discovery no-throw invariant', () => {
  it('malformed JSON shape never throws (returns discriminated-union failure)', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: { unexpected: 'shape' },
    });
    await expect(fetchIssuerConfig('https://issuer.example.com')).resolves.toBeDefined();
  });

  it('null body never throws', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: null,
    });
    await expect(fetchIssuerConfig('https://issuer.example.com')).resolves.toBeDefined();
  });

  it('non-object body (string) never throws', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: 'not-an-object',
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
  });

  it('upstream timeout never throws', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_REQUEST_TIMEOUT });
    await expect(fetchIssuerConfig('https://issuer.example.com')).resolves.toBeDefined();
  });

  it('non-HTTPS URL never throws (rejected by fetch-safe pre-check)', async () => {
    await expect(fetchIssuerConfig('http://issuer.example.com')).resolves.toBeDefined();
  });

  it('malformed issuer URL surfaces failure, does not throw', async () => {
    // 'not-a-url' has no scheme; fetch-safe boundary rejects with fetch_blocked_https_only
    const result = await fetchIssuerConfig('not-a-url');
    expect(result.ok).toBe(false);
  });
});
