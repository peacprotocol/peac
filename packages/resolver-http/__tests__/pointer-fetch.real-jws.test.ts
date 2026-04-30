// Real-JWS pointer harness (Commit 4; tightened in Commit 4.1).
//
// Drives resolver-http's pointer-fetch through real Ed25519-signed compact
// JWS fixtures generated at runtime via package-root @peac/crypto exports.
// No external network. No protocol-side mocking. No fake "byte-equal
// cross-implementation parity" claims; cross-implementation pointer parity
// is PR B's shadow-mode harness scope (see plan §"Cross-implementation
// pointer parity gate" in PR B).
//
// Hygiene: the fixture helper does NOT expose the private signing key.
// Tests assert behavior on the public surface only.

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
import { generateSignedJws, digestOfBody } from './_helpers/test-jws.js';

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

  it('Unicode claims live inside the signed payload; pointer-fetch hashes the resulting compact JWS string (which is ASCII)', async () => {
    // Wire-level shape: a compact JWS is base64url + dots, so the JWS string
    // itself is ASCII regardless of the Unicode characters in its payload
    // claims. pointer-fetch fetches the raw bytes of the compact JWS,
    // decodes them via TextDecoder('utf-8', { fatal: false }) (a no-op for
    // ASCII bytes), and hashes the resulting string. The Unicode claim only
    // exists inside the signed payload; pointer-fetch never receives raw
    // non-ASCII JSON as the body.
    const fixture = await generateSignedJws({
      payload: {
        purpose: 'café',
        notes: '日本語テスト',
        emoji: 'rocket',
      },
    });
    // Sanity: the compact JWS itself is ASCII-only.
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
    // never reaches the digest comparison.
    const fixture = await generateSignedJws();
    const bodyWithNewline = `${fixture.jws}\n`;
    enqueue('safeFetchRaw', {
      ok: true,
      status: 200,
      contentType: 'application/jose',
      body: bodyWithNewline,
    });
    // Even if the caller passes the digest of the newline-terminated body,
    // the shape check rejects first. Compute via digestOfBody helper to
    // avoid dynamic imports inside the test body.
    const expectedOfNewlineBody = await digestOfBody(bodyWithNewline);
    const result = await fetchPointerWithDigest(
      'https://issuer.example.com/receipt',
      expectedOfNewlineBody
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('pointer_malformed_jws');
    }
  });

  it('fixture self-validation surface: helper returns public material only (no private key)', async () => {
    // The helper runs decode + verify + typ/alg/kid/peac_version checks
    // before returning. This test makes the public-only surface visible at
    // the test boundary.
    const fixture = await generateSignedJws();
    expect(fixture.jws.split('.')).toHaveLength(3);
    expect(fixture.publicKey).toBeInstanceOf(Uint8Array);
    expect(fixture.publicKey.length).toBe(32);
    expect(fixture.expectedDigest).toMatch(/^[0-9a-f]{64}$/);
    // Header round-trip: helper asserts these, but we surface them so a
    // failed assertion gives reviewer signal at the test boundary.
    expect(fixture.header.typ).toBe('interaction-record+jwt');
    expect(fixture.header.alg).toBe('EdDSA');
    expect(fixture.header.kid).toBe('test-key-1');
    // Payload round-trip
    expect(fixture.payload.peac_version).toBe('0.2');
    // Hygiene: the fixture object MUST NOT expose privateKey.
    expect((fixture as Record<string, unknown>).privateKey).toBeUndefined();
  });
});
