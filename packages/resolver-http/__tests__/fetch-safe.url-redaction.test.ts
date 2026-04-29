// Deterministic URL stripping: surfaced messages contain ONLY the origin
// (protocol + host) plus the resolver-http error code. No path, no query,
// no fragment, no token-looking substrings ever appear.

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

interface Case {
  url: string;
  expectedMessage: string;
}

const CASES: readonly Case[] = [
  {
    url: 'https://issuer.example.com/.well-known/jwks.json',
    expectedMessage: 'fetch_blocked_ssrf at https://issuer.example.com',
  },
  {
    url: 'https://issuer.example.com/.well-known/peac-issuer.json?token=secret&kid=abc',
    expectedMessage: 'fetch_blocked_ssrf at https://issuer.example.com',
  },
  {
    url: 'https://issuer.example.com/path#fragment-with-token',
    expectedMessage: 'fetch_blocked_ssrf at https://issuer.example.com',
  },
  {
    url: 'https://api.example.com:8443/v1/keys/path/segments',
    expectedMessage: 'fetch_blocked_ssrf at https://api.example.com:8443',
  },
  {
    url: 'https://issuer.example.com/path%20with%20spaces?q=secret%21',
    expectedMessage: 'fetch_blocked_ssrf at https://issuer.example.com',
  },
];

describe('fetch-safe URL stripping (deterministic, exact-equality)', () => {
  for (const tc of CASES) {
    it(`strips path/query/fragment from ${tc.url}`, async () => {
      enqueue('safeFetchJson', { ok: false, code: NET_CODES.E_SSRF_URL_REJECTED });
      const result = await fetchJsonSafe(tc.url);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Exact-string-equality, not regex; prevents accidentally-stripped
        // variants from passing.
        expect(result.message).toBe(tc.expectedMessage);
        // Forbidden-substring checks (defense-in-depth)
        expect(result.message).not.toContain('?');
        expect(result.message).not.toContain('#');
        expect(result.message).not.toContain('token');
        expect(result.message).not.toContain('secret');
        expect(result.message).not.toContain('jwks.json');
        expect(result.message).not.toContain('peac-issuer.json');
        expect(result.message).not.toContain('/v1/keys');
      }
    });
  }
});
