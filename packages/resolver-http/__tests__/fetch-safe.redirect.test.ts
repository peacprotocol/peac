// Redirect cap: asserts verifier maxRedirects (3) is passed to net-node,
// NOT net-node's DEFAULT_MAX_REDIRECTS (5). Also asserts redirect-class
// upstream codes collapse to fetch_blocked_redirect.

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

describe('fetch-safe redirect: verifier 3-cap fires, not net-node default 5', () => {
  it('JSON path passes VERIFIER_LIMITS.maxRedirects (3) to net-node', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x');
    const opts = getLastOptions() as { maxRedirects?: number } | undefined;
    expect(opts?.maxRedirects).toBe(VERIFIER_LIMITS.maxRedirects);
    expect(opts?.maxRedirects).toBe(3);
    // Net-node default (5) MUST NOT be what fires
    expect(opts?.maxRedirects).not.toBe(5);
  });

  it('raw path passes VERIFIER_LIMITS.maxRedirects (3)', async () => {
    enqueue('safeFetchRaw', { ok: true, status: 200, body: 'x' });
    await fetchRawSafe('https://issuer.example.com/r');
    const opts = getLastOptions() as { maxRedirects?: number } | undefined;
    expect(opts?.maxRedirects).toBe(3);
  });

  it('caller override is honored', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x', { maxRedirects: 1 });
    const opts = getLastOptions() as { maxRedirects?: number } | undefined;
    expect(opts?.maxRedirects).toBe(1);
  });

  it('E_NET_SSRF_TOO_MANY_REDIRECTS maps to fetch_blocked_redirect', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_TOO_MANY_REDIRECTS });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_redirect');
  });

  it('E_NET_SSRF_REDIRECT_BLOCKED (cross-origin / private redirect target) maps to fetch_blocked_redirect', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_REDIRECT_BLOCKED });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('fetch_blocked_redirect');
  });
});

describe('fetch-safe JWKS path: deliberate zero-redirect exception (Commit 2.1 Fix #1)', () => {
  it('JWKS path does NOT pass maxRedirects to upstream safeFetchJWKS (signature Omit<..., maxRedirects>)', async () => {
    enqueue('safeFetchJWKS', { ok: true, status: 200, body: { keys: [] } });
    await fetchJwksSafe('https://issuer.example.com/jwks');
    const opts = getLastOptions() as Record<string, unknown> | undefined;
    expect(opts).toBeDefined();
    if (opts) {
      // Upstream safeFetchJWKS hardcodes maxRedirects: 0; resolver-http MUST
      // NOT pass a maxRedirects option to it. The key must be absent from
      // the options object passed across the boundary.
      expect('maxRedirects' in opts).toBe(false);
    }
  });

  it('caller-supplied maxRedirects on FetchSafeOptions is silently ignored on JWKS path', async () => {
    enqueue('safeFetchJWKS', { ok: true, status: 200, body: { keys: [] } });
    // Caller asks for 5 redirects; JWKS path forces 0 (upstream hardcode);
    // resolver-http does not pass the value through.
    await fetchJwksSafe('https://issuer.example.com/jwks', { maxRedirects: 5 });
    const opts = getLastOptions() as Record<string, unknown> | undefined;
    expect(opts).toBeDefined();
    if (opts) {
      expect('maxRedirects' in opts).toBe(false);
    }
  });

  it('JSON path still honors caller-supplied maxRedirects (control case)', async () => {
    enqueue('safeFetchJson', { ok: true, status: 200, body: {} });
    await fetchJsonSafe('https://issuer.example.com/x', { maxRedirects: 5 });
    const opts = getLastOptions() as { maxRedirects?: number } | undefined;
    expect(opts?.maxRedirects).toBe(5);
  });
});
