// Test helper: real Ed25519 keypair + real signed compact JWS for resolver-http.
//
// Uses ONLY package-root @peac/crypto exports (generateKeypair, signWire02,
// verify, decode, sha256Hex; all verified package-root from resolver-http
// context 2026-04-30). No private @peac/crypto/testkit subpath. No
// @peac/protocol references.
//
// The helper self-validates the generated fixture before returning it:
// 3 base64url segments, JSON-decodable header + payload, and a successful
// signature verification via @peac/crypto.verify. If any check fails, the
// helper throws to fail fast in test setup; callers do not see a partially
// formed fixture.

import { generateKeypair, signWire02, verify, decode, sha256Hex } from '@peac/crypto';

const COMPACT_JWS_3_SEGMENTS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface SignedJwsFixture {
  /** Compact JWS serialization (header.payload.signature) — string-mode digest input. */
  jws: string;
  /** sha256Hex(jws) — what resolver-http's pointer-fetch will compute. */
  expectedDigest: string;
  /** Ed25519 public key (32 bytes). */
  publicKey: Uint8Array;
  /** Ed25519 private key (32 bytes). Test-only; never logged. */
  privateKey: Uint8Array;
  /** kid used for signing. */
  kid: string;
  /** Decoded payload (post-verify). */
  payload: Record<string, unknown>;
}

export interface GenerateSignedJwsOptions {
  /** Caller-supplied claims overlay. peac_version: '0.2' is always set. */
  payload?: Record<string, unknown>;
  /** kid (default: 'test-key-1'). */
  kid?: string;
}

/**
 * Generate a real Ed25519 keypair and a real signed compact JWS at runtime.
 *
 * The returned fixture self-validates: 3 base64url segments, JSON-decodable
 * header + payload, and signature verification via @peac/crypto.verify.
 * Test setup fails fast on any internal inconsistency.
 */
export async function generateSignedJws(
  options: GenerateSignedJwsOptions = {}
): Promise<SignedJwsFixture> {
  const { privateKey, publicKey } = await generateKeypair();
  if (privateKey.length !== 32) throw new Error('test-jws: privateKey not 32 bytes');
  if (publicKey.length !== 32) throw new Error('test-jws: publicKey not 32 bytes');

  const kid = options.kid ?? 'test-key-1';
  const payload: Record<string, unknown> = {
    peac_version: '0.2',
    iss: 'https://issuer.example.com',
    rid: '01999999-9999-7999-9999-999999999999',
    iat: 1700000000,
    occurred_at: 1700000000,
    ...options.payload,
  };

  const jws = await signWire02(payload, privateKey, kid);

  // Self-validation #1: 3 base64url segments
  if (!COMPACT_JWS_3_SEGMENTS.test(jws)) {
    throw new Error('test-jws: generated JWS is not a 3-segment base64url shape');
  }

  // Self-validation #2: header + payload decode as JSON via @peac/crypto.decode
  let decoded: { header: { typ?: string; alg?: string; kid?: string }; payload: unknown };
  try {
    decoded = decode<unknown>(jws);
  } catch (err) {
    throw new Error(`test-jws: decode failed: ${(err as Error).message}`);
  }
  if (typeof decoded.header !== 'object' || decoded.header === null) {
    throw new Error('test-jws: decoded header is not an object');
  }
  if (typeof decoded.payload !== 'object' || decoded.payload === null) {
    throw new Error('test-jws: decoded payload is not an object');
  }

  // Self-validation #3: signature verifies via @peac/crypto.verify
  try {
    const result = await verify(jws, publicKey);
    if (typeof result !== 'object' || result === null) {
      throw new Error('verify returned non-object result');
    }
  } catch (err) {
    throw new Error(`test-jws: signature verify failed: ${(err as Error).message}`);
  }

  // String-mode digest: sha256Hex of the compact JWS string. This is what
  // resolver-http's pointer-fetch computes (semantically mirrors protocol's
  // path; see packages/resolver-http/src/pointer-fetch.ts).
  const expectedDigest = await sha256Hex(jws);

  return {
    jws,
    expectedDigest,
    publicKey,
    privateKey,
    kid,
    payload: decoded.payload as Record<string, unknown>,
  };
}
