// pointer-fetch SSRF / non-HTTPS / redirect coverage.

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

describe('pointer-fetch SSRF blocks', () => {
  it('non-HTTPS URL surfaces pointer_fetch_blocked (mirrors protocol)', async () => {
    const result = await fetchPointerWithDigest('http://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_fetch_blocked');
  });

  it('private-IP rejected by net-node SSRF -> fetch_blocked_ssrf', async () => {
    enqueue('safeFetchRaw', {
      ok: false,
      code: NET_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_ssrf');
  });

  it('redirect-blocked surfaces fetch_blocked_redirect', async () => {
    enqueue('safeFetchRaw', {
      ok: false,
      code: NET_CODES.E_SSRF_TOO_MANY_REDIRECTS,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_redirect');
  });

  it('cross-origin redirect surfaces fetch_blocked_redirect', async () => {
    enqueue('safeFetchRaw', {
      ok: false,
      code: NET_CODES.E_SSRF_REDIRECT_BLOCKED,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_redirect');
  });
});
