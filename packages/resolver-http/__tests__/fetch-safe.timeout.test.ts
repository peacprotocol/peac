// Timeout: asserts the verifier 5000ms cap is what fetch-safe passes to
// net-node, NOT net-node's own DEFAULT_TIMEOUT_MS (30000ms). Also asserts
// the upstream timeout codes (E_REQUEST_TIMEOUT, E_DNS_TIMEOUT, etc.) all
// collapse to fetch_timeout.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  getLastOptions,
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

import { VERIFIER_LIMITS } from '@peac/kernel';

import { fetchJsonSafe, fetchJwksSafe, fetchRawSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
});

describe('fetch-safe timeout: verifier cap fires, not net-node default', () => {
  it('verifier timeout (5000ms) is passed to net-node when caller omits timeoutMs', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x');
    const opts = getLastOptions() as { timeoutMs?: number } | undefined;
    expect(opts?.timeoutMs).toBe(VERIFIER_LIMITS.fetchTimeoutMs);
    expect(opts?.timeoutMs).toBe(5000);
    // Hard assertion: net-node default (30000) MUST NOT be what fired
    expect(opts?.timeoutMs).not.toBe(30000);
  });

  it('caller-supplied tighter timeout overrides verifier default', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x', { timeoutMs: 1500 });
    const opts = getLastOptions() as { timeoutMs?: number } | undefined;
    expect(opts?.timeoutMs).toBe(1500);
  });

  it('all upstream timeout error codes collapse to fetch_timeout', async () => {
    const timeoutCodes = [
      NET_CODES.E_REQUEST_TIMEOUT,
      NET_CODES.E_DNS_TIMEOUT,
      NET_CODES.E_CONNECT_TIMEOUT,
      NET_CODES.E_HEADERS_TIMEOUT,
      NET_CODES.E_BODY_TIMEOUT,
    ];
    for (const code of timeoutCodes) {
      enqueue('safeFetchJson', { ok: false, code });
      const result = await fetchJsonSafe('https://issuer.example.com/x');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('fetch_timeout');
      }
    }
  });

  it('verifier timeout also fires through fetchJwksSafe and fetchRawSafe', async () => {
    enqueue('safeFetchJWKS', { ok: true, status: 200, body: { keys: [] } });
    await fetchJwksSafe('https://issuer.example.com/jwks');
    expect((getLastOptions() as { timeoutMs?: number } | undefined)?.timeoutMs).toBe(5000);

    enqueue('safeFetchRaw', { ok: true, status: 200, body: 'x' });
    await fetchRawSafe('https://issuer.example.com/r');
    expect((getLastOptions() as { timeoutMs?: number } | undefined)?.timeoutMs).toBe(5000);
  });
});
