// HTTPS-only pre-check: non-HTTPS URLs are rejected at the resolver-http
// boundary BEFORE any net-node fetch dispatch. Asserts the mock is never
// called.

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
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

import { fetchJsonSafe, fetchJwksSafe, fetchRawSafe } from '../src/fetch-safe.js';

beforeEach(() => {
  resetMock();
  mockSafeFetchJson.mockClear();
  mockSafeFetchJWKS.mockClear();
  mockSafeFetchRaw.mockClear();
});

const NON_HTTPS = [
  'http://issuer.example.com/x',
  'ftp://issuer.example.com/x',
  'file:///etc/passwd',
  'gopher://example.com',
  'data:text/plain,hello',
  'javascript:alert(1)',
];

describe('fetch-safe HTTPS-only pre-check', () => {
  for (const url of NON_HTTPS) {
    it(`fetchJsonSafe rejects ${url} with fetch_blocked_https_only and never dispatches`, async () => {
      const result = await fetchJsonSafe(url);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('fetch_blocked_https_only');
      }
      expect(mockSafeFetchJson).not.toHaveBeenCalled();
    });

    it(`fetchJwksSafe rejects ${url} with fetch_blocked_https_only`, async () => {
      const result = await fetchJwksSafe(url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('fetch_blocked_https_only');
      expect(mockSafeFetchJWKS).not.toHaveBeenCalled();
    });

    it(`fetchRawSafe rejects ${url} with fetch_blocked_https_only`, async () => {
      const result = await fetchRawSafe(url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('fetch_blocked_https_only');
      expect(mockSafeFetchRaw).not.toHaveBeenCalled();
    });
  }

  it('a malformed URL surfaces fetch_blocked_https_only with sanitized origin', async () => {
    const result = await fetchJsonSafe('not-a-url');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('fetch_blocked_https_only');
      expect(result.message).toContain('<invalid-url>');
    }
    expect(mockSafeFetchJson).not.toHaveBeenCalled();
  });
});
