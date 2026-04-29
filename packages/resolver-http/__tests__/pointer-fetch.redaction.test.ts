// pointer-fetch redaction: digest-mismatch error path leaks no body / URL /
// header / secret content. Only public hashes (sha256 hex) and bounded
// numeric counters are surfaced.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { sha256Hex } from '@peac/crypto';

import {
  mockSafeFetchJson,
  mockSafeFetchJWKS,
  mockSafeFetchRaw,
  enqueue,
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

import { fetchPointerWithDigest } from '../src/pointer-fetch.js';

// Compact-like JWS string: 3 base64url segments (matches COMPACT_JWS_REGEX)
// but NOT a real signed JWS. The protected header decodes to 'header' (not
// JSON) and the signature is not real Ed25519 material. resolver-http's
// pointer-fetch only validates 3-segment base64url shape before computing
// the digest, so this fixture is sufficient for digest / content-type /
// redaction tests. Commit 4 will introduce real signed-JWS fixtures for
// cross-implementation byte-equal parity.
const COMPACT_LIKE_JWS = 'aGVhZGVy.cGF5bG9hZA.c2lnbmF0dXJl';

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

describe('pointer-fetch redaction', () => {
  it('digest-mismatch error contains only origin + code + public hashes', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: COMPACT_LIKE_JWS,
    });
    const wrongExpected = '0'.repeat(64);
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/path/with/secrets?token=abc&kid=def',
      wrongExpected
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_digest_mismatch');
      // message contains only origin + code; no path / query / token
      expect(result.message).toContain('https://issuer.example.com');
      expect(result.message).not.toContain('/path/with/secrets');
      expect(result.message).not.toContain('token=');
      expect(result.message).not.toContain('abc');
      expect(result.message).not.toContain('kid=');
      // Both digests are public hashes ; safe to surface
      expect(result.actualDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(result.expectedDigest).toBe(wrongExpected);
      // No body content in any field
      const allStrings = flattenStrings(result);
      for (const s of allStrings) {
        expect(s).not.toContain(COMPACT_LIKE_JWS);
      }
    }
  });

  it('upstream cause from fetchRawSafe with secrets does not bleed through', async () => {
    enqueue('safeFetchRaw', {
      ok: false,
      code: 'E_NET_NETWORK_ERROR' as const,
      error: 'Connection failed Bearer abc123 Cookie: session=xyz',
      cause: {
        message: '-----BEGIN PRIVATE KEY-----secret',
        stack: 'Authorization: Basic dXNlcg==',
      },
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', '0'.repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const allStrings = flattenStrings(result);
      for (const s of allStrings) {
        for (const re of FORBIDDEN_PATTERNS) {
          expect(s).not.toMatch(re);
        }
        expect(s).not.toContain('abc123');
        expect(s).not.toContain('session=xyz');
      }
    }
  });

  it('expected-digest format failure (pointer_invalid_expected_digest) does NOT leak the bad digest text', async () => {
    const badInput = 'totally-not-a-digest';
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r?token=secret',
      badInput
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_invalid_expected_digest');
      expect(result.message).not.toContain(badInput);
      expect(result.message).not.toContain('token');
    }
  });
});
