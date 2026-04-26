/**
 * Codec byte-identical golden vectors.
 *
 * Asserts that defaultCodec.encode() produces output BYTE-IDENTICAL to
 * the existing @peac/crypto.signWire02 path for a small set of golden
 * codec vectors: same key, same kid, same payload. Both sides see
 * identical inputs; output is deterministic regardless of clock.
 *
 * Scope note: these are local golden vectors that exercise the codec
 * boundary, NOT every Wire 0.2 conformance fixture. The Wire 0.2
 * conformance suite remains the canonical schema-validation gate; this
 * test isolates the codec-as-no-op-delegation invariant. The public-API
 * baseline test (issue-verify-baseline.test.ts) covers the higher-level
 * issue() / verifyLocal() public surface preservation.
 *
 * If any vector diverges, this PR is stop-the-line. The codec MUST be a
 * no-op delegation in v0.13.1.
 */

import { describe, expect, it } from 'vitest';
import { generateKeypair, signWire02, verify as cryptoVerify } from '@peac/crypto';
import { defaultCodec } from '../../src/_internal/record-core/codec/jws-jwt.js';

// Golden codec vectors. payload is `unknown` per signWire02's signature; the
// codec is a pure pass-through, so any JSON-serializable payload exercises
// the byte-identity invariant. These are local vectors, not the Wire 0.2
// conformance corpus.
const VECTORS: ReadonlyArray<{ id: string; kid: string; payload: unknown }> = [
  {
    id: 'minimal-string-payload',
    kid: 'test-kid-1',
    payload: { peac_version: '0.2', greeting: 'hello' },
  },
  {
    id: 'wire-0.2-shaped-claims',
    kid: 'test-kid-2',
    payload: {
      peac_version: '0.2',
      iss: 'https://issuer.example/.well-known/peac-issuer',
      aud: 'https://aud.example/agent',
      type: 'https://peacprotocol.org/types/agent-action',
      iat: 1735689600,
      jti: '01940000-0000-7000-8000-000000000001',
      occurred_at: '2026-04-01T00:00:00Z',
    },
  },
  {
    id: 'nested-extension',
    kid: 'test-kid-3',
    payload: {
      peac_version: '0.2',
      ext: { 'org.peacprotocol/identity': { actor: 'agent-x' } },
    },
  },
  {
    id: 'unicode-strings',
    kid: 'test-kid-4',
    payload: { peac_version: '0.2', note: 'hello world: café ☃' },
  },
];

describe('defaultCodec.encode: byte-identical to signWire02 (golden codec vectors)', () => {
  it.each(VECTORS)('$id: encode output equals signWire02 output', async (vec) => {
    const { privateKey } = await generateKeypair();

    const fromCrypto = await signWire02(vec.payload, privateKey, vec.kid);
    const fromCodec = await defaultCodec.encode(vec.payload, privateKey, vec.kid);

    expect(fromCodec).toBe(fromCrypto);
  });
});

describe('defaultCodec.decode: faithful to crypto.verify (golden codec vectors)', () => {
  it.each(VECTORS)('$id: decode result equals cryptoVerify result', async (vec) => {
    const { privateKey, publicKey } = await generateKeypair();
    const jws = await signWire02(vec.payload, privateKey, vec.kid);

    const fromCrypto = await cryptoVerify(jws, publicKey);
    const fromCodec = await defaultCodec.decode(jws, publicKey);

    // Faithful pass-through: same valid flag, same header object shape,
    // same payload object shape. Identity is not required for nested
    // structures (decode parses fresh each time), but structural equality
    // is.
    expect(fromCodec.valid).toBe(fromCrypto.valid);
    expect(fromCodec.header).toEqual(fromCrypto.header);
    expect(fromCodec.payload).toEqual(fromCrypto.payload);
  });
});
