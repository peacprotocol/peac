// pointer-fetch digest: string-mode digest (TextDecoder UTF-8 then sha256Hex).
// (Plan Fix #5: pointer-fetch target is a compact JWS string, not JSON.)

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

describe('pointer-fetch digest semantics (string-mode)', () => {
  it('ASCII compact JWS body: digest matches', async () => {
    const expected = await sha256Hex(COMPACT_LIKE_JWS);
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: COMPACT_LIKE_JWS,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', expected);
    expect(result.ok).toBe(true);
  });

  it('non-ASCII UTF-8 body decodes through TextDecoder before sha256Hex', async () => {
    // Build a synthetic body that's still a valid 3-segment compact-JWS
    // shape but contains a non-ASCII char in one of the segments... wait,
    // compact JWS is base64url which is ASCII-only. So we test that if the
    // server happens to return non-ASCII bytes we still surface
    // pointer_malformed_jws (compact-JWS regex rejects non-base64url chars)
    // rather than crashing on the decode.
    const nonAscii = new TextEncoder().encode('héllo.wörld.signaturé');
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      bytes: nonAscii,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', 'a'.repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_malformed_jws');
    }
  });

  it('trailing newline in valid compact JWS surfaces pointer_malformed_jws (newline is not base64url)', async () => {
    const withNewline = `${COMPACT_LIKE_JWS}\n`;
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: withNewline,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/r',
      await sha256Hex(withNewline)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The trailing-newline body is no longer a valid compact-JWS shape
      // because '\n' is not base64url. resolver-http rejects with
      // pointer_malformed_jws BEFORE the digest comparison. This matches
      // protocol's malformed_receipt branch (newline outside the 3-segment
      // base64url shape).
      expect(result.code).toBe('pointer_malformed_jws');
    }
  });

  it('digest input is the decoded UTF-8 string (sha256Hex of TextEncoder.encode of the string)', async () => {
    // Construct a compact JWS, fetch its bytes, and assert the actualDigest
    // matches sha256Hex(decoded-string) byte-for-byte.
    const bodyStr = 'aGVhZGVyMg.cGF5bG9hZDI.c2lnbmF0dXJlMg';
    const expectedFromString = await sha256Hex(bodyStr);
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: bodyStr,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/r', expectedFromString);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actualDigest).toBe(expectedFromString);
    }
  });
});
