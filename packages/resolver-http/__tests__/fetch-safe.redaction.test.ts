// Redaction (basic): error messages MUST NOT contain sensitive material
// from the URL, request, or response. Allowed: code identifier + sanitized
// origin (protocol + host).

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

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /Bearer\s+\S+/,
  /Cookie:|Set-Cookie:/i,
  /Authorization:/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\?token=/,
  /\?api_key=/,
  /password=/i,
];

describe('fetch-safe redaction (basic)', () => {
  it('error message contains only code + sanitized origin (no path / query)', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_URL_REJECTED });
    const result = await fetchJsonSafe(
      'https://issuer.example.com/.well-known/peac-issuer.json?token=secret123'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('fetch_blocked_ssrf at https://issuer.example.com');
      // No path
      expect(result.message).not.toContain('/.well-known');
      // No query
      expect(result.message).not.toContain('token=');
      expect(result.message).not.toContain('secret123');
    }
  });

  it('upstream error.message containing secrets does NOT bleed into resolver-http message', async () => {
    enqueue('safeFetchJson', {
      ok: false,
      code: NET_CODES.E_NETWORK_ERROR,
      error: 'Connection failed Bearer abc123 Cookie: session=xyz',
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const re of FORBIDDEN_PATTERNS) {
        expect(result.message).not.toMatch(re);
      }
      expect(result.message).not.toContain('abc123');
      expect(result.message).not.toContain('session=xyz');
    }
  });

  it('HTTP 4xx surfaces only the status + code + origin, not the body', async () => {
    enqueue('safeFetchJson', {
      ok: true,
      status: 401,
      contentType: 'application/json',
      body: { error: 'Bearer abc123 invalid' },
    });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_status_4xx');
      expect(result.status).toBe(401);
      for (const re of FORBIDDEN_PATTERNS) {
        expect(result.message).not.toMatch(re);
      }
      expect(result.message).not.toContain('abc123');
    }
  });

  it('safe high-level fields ARE present (negative-control)', async () => {
    enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_REQUEST_TIMEOUT });
    const result = await fetchJsonSafe('https://issuer.example.com/x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_timeout');
      expect(result.message).toContain('https://issuer.example.com'); // origin allowed
      expect(result.message).toContain('fetch_timeout'); // code allowed
    }
  });
});
