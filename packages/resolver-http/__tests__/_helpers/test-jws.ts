// Test helper: real Ed25519 keypair + real signed compact JWS for resolver-http.
//
// Uses ONLY package-root @peac/crypto exports (generateKeypair, signWire02,
// verify, decode, sha256Hex; verified package-root from resolver-http
// context 2026-04-30). Private crypto subpaths (notably the testkit entry)
// are forbidden. The protocol package is forbidden in all forms — runtime
// or test — under packages/resolver-http/__tests__/_helpers/.
//
// Hygiene: the private key is kept LOCAL to this helper. signWire02
// consumes it once; the returned fixture exposes only the public key, the
// JWS, and metadata. Reducing key exposure by default avoids accidental
// leak surface in failed assertions, snapshots, or future helper reuse.
//
// The helper self-validates the generated fixture before returning it:
// 3 base64url segments, JSON-decodable header + payload via @peac/crypto.decode,
// header carries the expected typ + alg + kid, payload carries
// peac_version: '0.2', and signature verifies via @peac/crypto.verify. If any
// check fails, the helper throws to fail fast in test setup; callers do not
// see a partially-formed fixture.

import { generateKeypair, signWire02, verify, decode, sha256Hex } from '@peac/crypto';

const COMPACT_JWS_3_SEGMENTS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Wire 0.2 typ / alg constants. We assert these without importing them from
// @peac/schema or @peac/crypto's private modules; the values are stable
// across the Wire 0.2 cycle and locking them here keeps resolver-http test
// helpers free of additional dependency edges.
const EXPECTED_TYP = 'interaction-record+jwt';
const EXPECTED_ALG = 'EdDSA';

export interface SignedJwsFixture {
  /** Compact JWS serialization (header.payload.signature); string-mode digest input. */
  jws: string;
  /** sha256Hex(jws); what resolver-http's pointer-fetch will compute. */
  expectedDigest: string;
  /** Ed25519 public key (32 bytes). */
  publicKey: Uint8Array;
  /** kid used for signing. */
  kid: string;
  /** Decoded payload (post-verify). */
  payload: Record<string, unknown>;
  /** Decoded header (post-verify); useful for assertions in tests. */
  header: { typ?: string; alg?: string; kid?: string };
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
 * The private key is kept LOCAL to this function and is never returned. The
 * fixture exposes only the public key, the JWS, and decoded header/payload
 * metadata.
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
  // Self-validation #2a: header carries the expected Wire 0.2 typ
  if (decoded.header.typ !== EXPECTED_TYP) {
    throw new Error(`test-jws: header.typ "${decoded.header.typ}" !== expected "${EXPECTED_TYP}"`);
  }
  // Self-validation #2b: header alg is EdDSA
  if (decoded.header.alg !== EXPECTED_ALG) {
    throw new Error(`test-jws: header.alg "${decoded.header.alg}" !== expected "${EXPECTED_ALG}"`);
  }
  // Self-validation #2c: header kid round-trips the requested kid
  if (decoded.header.kid !== kid) {
    throw new Error(`test-jws: header.kid "${decoded.header.kid}" !== requested "${kid}"`);
  }
  // Self-validation #2d: payload carries peac_version: '0.2'
  const decodedPayload = decoded.payload as Record<string, unknown>;
  if (decodedPayload.peac_version !== '0.2') {
    throw new Error(
      `test-jws: payload.peac_version "${String(decodedPayload.peac_version)}" !== '0.2'`
    );
  }

  // Self-validation #3: signature verifies via @peac/crypto.verify and
  // returns a meaningful object with header / payload accessible.
  let verifyResult: { header?: { typ?: string }; payload?: unknown };
  try {
    verifyResult = (await verify(jws, publicKey)) as {
      header?: { typ?: string };
      payload?: unknown;
    };
  } catch (err) {
    throw new Error(`test-jws: signature verify failed: ${(err as Error).message}`);
  }
  if (typeof verifyResult !== 'object' || verifyResult === null) {
    throw new Error('test-jws: verify() returned non-object result');
  }
  if (verifyResult.header?.typ !== EXPECTED_TYP) {
    throw new Error(
      `test-jws: verify().header.typ "${verifyResult.header?.typ}" !== expected "${EXPECTED_TYP}"`
    );
  }
  if (typeof verifyResult.payload !== 'object' || verifyResult.payload === null) {
    throw new Error('test-jws: verify().payload is not an object');
  }

  // String-mode digest: sha256Hex of the compact JWS string. This is what
  // resolver-http's pointer-fetch computes (semantically mirrors protocol's
  // path; see packages/resolver-http/src/pointer-fetch.ts).
  const expectedDigest = await sha256Hex(jws);

  // privateKey goes out of scope when this function returns; not exposed
  // on the fixture object by design (Commit 4.1 hygiene).
  return {
    jws,
    expectedDigest,
    publicKey,
    kid,
    payload: decodedPayload,
    header: decoded.header,
  };
}

/**
 * Compute the string-mode digest of a body string. Re-exported here so test
 * files can compute expected digests without dynamically importing
 * @peac/crypto inside an `it()` block. Package-root @peac/crypto.sha256Hex
 * is the only allowed source.
 */
export async function digestOfBody(body: string): Promise<string> {
  return sha256Hex(body);
}
