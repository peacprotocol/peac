// Consolidated network-path failure-mode coverage for pointer-fetch (Commit 4).
//
// Each test pairs an upstream net-node failure code with the EXPECTED
// resolver-http error code, plus asserts redaction discipline (no body /
// URL path / query / headers / secrets in any surfaced field).
//
// Existing pointer-fetch.ssrf.test.ts covers SSRF + redirect classes; this
// file adds the broader timeout / network-error / byte-cap / status / non-
// HTTPS / redaction matrix in one place so the failure-mode contract is easy
// to read in one diff.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
  resetMock,
  NET_CODES,
  type NetNodeErrorCode,
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

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /Bearer\s+\S+/,
  /Cookie:|Set-Cookie:/i,
  /Authorization:/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\?token=/,
  /\?api_key=/,
  /password=/i,
];

function flattenStrings(value: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 6) return acc;
  if (typeof value === 'string') {
    acc.push(value);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      flattenStrings(v, depth + 1, acc);
    }
  }
  return acc;
}

function assertRedacted(result: unknown): void {
  const allStrings = flattenStrings(result);
  for (const s of allStrings) {
    for (const re of FORBIDDEN_PATTERNS) {
      expect(s).not.toMatch(re);
    }
    expect(s).not.toContain('/path/with/secrets');
    expect(s).not.toContain('?token=');
    expect(s).not.toContain('kid-of-secret');
  }
}

const SENSITIVE_URL = 'https://issuer.example.com/path/with/secrets?token=abc&kid=kid-of-secret';

interface NetworkCase {
  label: string;
  upstream: NetNodeErrorCode;
  expected:
    | 'fetch_timeout'
    | 'fetch_network_error'
    | 'fetch_blocked_byte_cap'
    | 'fetch_blocked_redirect'
    | 'fetch_blocked_ssrf';
}

const NETWORK_CASES: readonly NetworkCase[] = [
  // Timeouts
  { label: 'request timeout', upstream: NET_CODES.E_REQUEST_TIMEOUT, expected: 'fetch_timeout' },
  { label: 'DNS timeout', upstream: NET_CODES.E_DNS_TIMEOUT, expected: 'fetch_timeout' },
  { label: 'connect timeout', upstream: NET_CODES.E_CONNECT_TIMEOUT, expected: 'fetch_timeout' },
  { label: 'headers timeout', upstream: NET_CODES.E_HEADERS_TIMEOUT, expected: 'fetch_timeout' },
  { label: 'body timeout', upstream: NET_CODES.E_BODY_TIMEOUT, expected: 'fetch_timeout' },
  // Network errors
  {
    label: 'generic network error',
    upstream: NET_CODES.E_NETWORK_ERROR,
    expected: 'fetch_network_error',
  },
  {
    label: 'DNS resolution failed',
    upstream: NET_CODES.E_DNS_RESOLUTION_FAILED,
    expected: 'fetch_network_error',
  },
  // Byte cap
  {
    label: 'response too large',
    upstream: NET_CODES.E_RESPONSE_TOO_LARGE,
    expected: 'fetch_blocked_byte_cap',
  },
  // Redirect
  {
    label: 'too many redirects',
    upstream: NET_CODES.E_SSRF_TOO_MANY_REDIRECTS,
    expected: 'fetch_blocked_redirect',
  },
  {
    label: 'redirect blocked (cross-origin)',
    upstream: NET_CODES.E_SSRF_REDIRECT_BLOCKED,
    expected: 'fetch_blocked_redirect',
  },
  // SSRF
  {
    label: 'SSRF URL rejected',
    upstream: NET_CODES.E_SSRF_URL_REJECTED,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'SSRF DNS resolved private',
    upstream: NET_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
    expected: 'fetch_blocked_ssrf',
  },
  {
    label: 'SSRF all IPs blocked',
    upstream: NET_CODES.E_SSRF_ALL_IPS_BLOCKED,
    expected: 'fetch_blocked_ssrf',
  },
];

describe('pointer-fetch network-path failure modes', () => {
  for (const tc of NETWORK_CASES) {
    it(`${tc.upstream} -> ${tc.expected} (${tc.label}); message redacted`, async () => {
      enqueue('safeFetchRaw', {
        ok: false,
        code: tc.upstream,
        error: 'Bearer abc123 leaked in upstream message',
        cause: { message: 'Cookie: session=secret-xyz' },
      });
      const result = await fetchPointerWithDigest(SENSITIVE_URL, ANY_DIGEST);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(tc.expected);
        assertRedacted(result);
      }
    });
  }

  it('non-HTTPS URL pre-check (mapped to pointer_fetch_blocked); message redacted', async () => {
    const result = await fetchPointerWithDigest(
      'http://issuer.example.com/path/with/secrets?token=abc',
      ANY_DIGEST
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_fetch_blocked');
      assertRedacted(result);
    }
  });

  it('HTTP 404 (4xx class); message redacted', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 404,
      contentType: 'text/html',
      body: 'not found Bearer abc123',
    });
    const result = await fetchPointerWithDigest(SENSITIVE_URL, ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_4xx');
      expect(result.status).toBe(404);
      assertRedacted(result);
    }
  });

  it('HTTP 503 (5xx class); message redacted', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 503,
      contentType: 'text/plain',
      body: 'service unavailable Cookie: session=secret',
    });
    const result = await fetchPointerWithDigest(SENSITIVE_URL, ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_5xx');
      expect(result.status).toBe(503);
      assertRedacted(result);
    }
  });

  it('upstream cause chain with secrets does not bleed through (resolver-http boundary redaction)', async () => {
    enqueue('safeFetchRaw', {
      ok: false,
      code: NET_CODES.E_NETWORK_ERROR,
      error: 'Bearer abc123 connection failed',
      cause: {
        message: '-----BEGIN PRIVATE KEY-----secret-material',
        stack: 'Authorization: Basic dXNlcjpwYXNz',
      },
      upstreamPayload: { body: 'A'.repeat(512), token: 'leaked-token-value' },
    });
    const result = await fetchPointerWithDigest(SENSITIVE_URL, ANY_DIGEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_network_error');
      assertRedacted(result);
      // Defense-in-depth: result keys are restricted to the discriminated-union shape
      const keys = Object.keys(result).sort();
      for (const k of keys) {
        expect(['ok', 'code', 'message', 'status']).toContain(k);
      }
    }
  });
});
