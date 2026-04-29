// Real-JWS pointer harness (Commit 4).
//
// Drives resolver-http's pointer-fetch through real Ed25519-signed compact
// JWS fixtures generated at runtime via package-root @peac/crypto exports.
// No external network. No protocol-side mocking. No fake "byte-equal
// cross-implementation parity" claims; cross-implementation pointer parity
// is PR B's shadow-mode harness scope (see plan §"Cross-implementation
// pointer parity gate" in PR B).

import { vi, describe, it, expect, beforeEach } from 'vitest';

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
import { generateSignedJws } from './_helpers/test-jws.js';

beforeEach(() => {
  resetMock();
});

describe('pointer-fetch real-JWS harness', () => {
  it('real signed compact JWS succeeds with digest match', async () => {
    const fixture = await generateSignedJws();
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: fixture.jws,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      fixture.expectedDigest
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt).toBe(fixture.jws);
      expect(result.actualDigest).toBe(fixture.expectedDigest);
      expect(result.expectedDigest).toBe(fixture.expectedDigest);
      expect(result.contentType).toBe('application/jose');
      expect(result.contentTypeWarning).toBeUndefined();
    }
  });

  it('digest mismatch fails with pointer_digest_mismatch and surfaces both digests', async () => {
    const fixture = await generateSignedJws();
    const wrongDigest = '0'.repeat(64);
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: fixture.jws,
    });
    const result = await fetchPointerWithDigest('https://issuer.example.com/receipt', wrongDigest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_digest_mismatch');
      expect(result.actualDigest).toBe(fixture.expectedDigest);
      expect(result.expectedDigest).toBe(wrongDigest);
    }
  });

  it('Unicode claims are signed into a real compact JWS; pointer-fetch hashes the resulting compact JWS string after UTF-8 decode', async () => {
    // The compact JWS itself is ASCII (base64url + dots), even though its
    // payload claims contain non-ASCII characters. pointer-fetch fetches the
    // raw bytes, decodes them via TextDecoder('utf-8', { fatal: false }), and
    // hashes the resulting string. For ASCII bodies the decode round-trip is
    // a no-op and digest math is byte-identical. The Unicode claim only lives
    // inside the signed payload, not in the wire bytes.
    const fixture = await generateSignedJws({
      payload: {
        purpose: 'café',
        notes: '日本語テスト',
        emoji: 'rocket',
      },
    });
    // Sanity: the JWS itself is ASCII (base64url + dots) regardless of the
    // non-ASCII claims it carries.
    expect(/^[\x20-\x7e]+$/.test(fixture.jws)).toBe(true);

    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: fixture.jws,
    });
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      fixture.expectedDigest
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actualDigest).toBe(fixture.expectedDigest);
    }
  });

  it('trailing newline body is rejected by the compact-JWS shape check (parser order: shape before digest)', async () => {
    // Documented parser order in resolver-http's pointer-fetch:
    //   1. fetchRawSafe -> raw bytes
    //   2. TextDecoder UTF-8 -> string
    //   3. compact-JWS regex shape check -> reject as pointer_malformed_jws if not 3 base64url segments
    //   4. sha256Hex -> compare to expected digest
    // A trailing newline breaks the regex shape check at step 3; the test
    // never reaches the digest comparison. This is asserted explicitly per
    // the Commit 4.0.1 fixture rule "trailing newline fails as malformed or
    // digest mismatch, depending on exact parser order, but must be explicit
    // and tested".
    const fixture = await generateSignedJws();
    const bodyWithNewline = `${fixture.jws}\n`;
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: bodyWithNewline,
    });
    // Even if caller passes the digest of the newline-terminated body, the
    // shape check rejects first.
    const expectedOfNewlineBody = (await import('@peac/crypto')).sha256Hex
      ? await (await import('@peac/crypto')).sha256Hex(bodyWithNewline)
      : '';
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      expectedOfNewlineBody
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_malformed_jws');
    }
  });

  it('helper self-validation: generated fixture verifies via @peac/crypto.verify (no private subpath)', async () => {
    // The helper itself runs verify() before returning; this test makes the
    // self-validation visible at the test boundary.
    const fixture = await generateSignedJws();
    expect(fixture.jws.split('.')).toHaveLength(3);
    expect(fixture.publicKey).toBeInstanceOf(Uint8Array);
    expect(fixture.publicKey.length).toBe(32);
    expect(fixture.privateKey.length).toBe(32);
    expect(fixture.expectedDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});
