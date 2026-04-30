// pointer-fetch smoke: happy path + clean digest mismatch.

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

beforeEach(() => {
  resetMock();
});

// Compact-like JWS string: 3 base64url segments (matches COMPACT_JWS_REGEX)
// but NOT a real signed JWS. The protected header decodes to 'header' (not
// JSON) and the signature is not real Ed25519 material. resolver-http's
// pointer-fetch only validates 3-segment base64url shape before computing
// the digest, so this fixture is sufficient for digest / content-type /
// redaction tests. Commit 4 will introduce real signed-JWS fixtures for
// cross-implementation byte-equal parity.
const COMPACT_LIKE_JWS = 'aGVhZGVy.cGF5bG9hZA.c2lnbmF0dXJl';

describe('pointer-fetch smoke', () => {
  it('happy-path returns receipt + actualDigest matching expected', async () => {
    const expected = await sha256Hex(COMPACT_LIKE_JWS);
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: COMPACT_LIKE_JWS,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/receipt', expected);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt).toBe(COMPACT_LIKE_JWS);
      expect(result.actualDigest).toBe(expected);
      expect(result.expectedDigest).toBe(expected);
      expect(result.contentType).toBe('application/jose');
      expect(result.contentTypeWarning).toBeUndefined();
    }
  });

  it('digest mismatch surfaces pointer_digest_mismatch with both digests', async () => {
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: COMPACT_LIKE_JWS,
    });
    const wrong = '0'.repeat(64);
    const result = await fetchPointerWithDigest('https://issuer.example.com/receipt', wrong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_digest_mismatch');
      expect(result.actualDigest).toBe(await sha256Hex(COMPACT_LIKE_JWS));
      expect(result.expectedDigest).toBe(wrong);
    }
  });

  it('invalid expected-digest format (not 64 lowercase hex) surfaces pointer_invalid_expected_digest', async () => {
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      'not a digest'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pointer_invalid_expected_digest');
  });

  it('invalid digest class is distinct from URL-blocked class (Commit 3.1 Fix #3)', async () => {
    const a = await fetchPointerWithDigest('https://issuer.example.com/r', 'bad-digest');
    const b = await fetchPointerWithDigest('http://issuer.example.com/r', '0'.repeat(64));
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      expect(a.code).toBe('pointer_invalid_expected_digest');
      expect(b.code).toBe('pointer_fetch_blocked');
      // The two classes are distinct
      expect(a.code).not.toBe(b.code);
    }
  });
});
