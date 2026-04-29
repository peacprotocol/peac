// Dangerous-port: net-node blocks well-known service ports (e.g. 25, 6379).
// Asserts the upstream codes collapse to fetch_blocked_dangerous_port.

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

import { fetchJsonSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

describe('fetch-safe dangerous-port mapping', () => {
  it('E_NET_SSRF_DANGEROUS_PORT maps to fetch_blocked_dangerous_port', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_DANGEROUS_PORT });
    const result = await fetchJsonSafe('https://issuer.example.com:25/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_dangerous_port');
  });

  it('E_NET_SSRF_DANGEROUS_PORT_ACK_MISSING maps to fetch_blocked_dangerous_port', async () => {
    enqueue('safeFetchJson', {
      ok: false,
      code: NET_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING,
    });
    const result = await fetchJsonSafe('https://issuer.example.com:6379/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_dangerous_port');
  });
});
