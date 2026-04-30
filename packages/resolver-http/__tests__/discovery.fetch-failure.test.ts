// Discovery fetch-failure pass-through tests.
// 4xx / 5xx / network / SSRF / timeout failures from fetch-safe must
// surface unchanged (no double-mapping); discovery-layer mapping only
// fires for shape failures.

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

describe('discovery fetch-failure pass-through', () => {
  it('4xx surfaces fetch_status_4xx unchanged', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 404,
      contentType: 'text/html',
      body: 'not found',
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_status_4xx');
  });

  it('5xx surfaces fetch_status_5xx unchanged', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 503,
      contentType: 'text/plain',
      body: 'service unavailable',
    });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_status_5xx');
  });

  it('network error surfaces fetch_network_error unchanged', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_NETWORK_ERROR });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_network_error');
  });

  it('SSRF block surfaces fetch_blocked_ssrf unchanged', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_DNS_RESOLVED_PRIVATE });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_ssrf');
  });

  it('timeout surfaces fetch_timeout unchanged', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_REQUEST_TIMEOUT });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_timeout');
  });

  it('byte cap surfaces fetch_blocked_byte_cap unchanged (discovery_oversized reserved for future)', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_RESPONSE_TOO_LARGE });
    const result = await fetchIssuerConfig('https://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_byte_cap');
  });

  it('non-HTTPS issuer URL is rejected by fetch-safe HTTPS-only pre-check', async () => {
    // No mock enqueued because the pre-check fires before any net-node call.
    const result = await fetchIssuerConfig('http://issuer.example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_https_only');
  });
});
