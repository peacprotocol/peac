/**
 * Canonical `kid` validation on the signing and verification paths.
 *
 * The invariant under test: the canonical signer must never mint a record that the canonical
 * verifier rejects because of the signer-supplied `kid`. Signing applies the rule before building
 * the protected header, so a value that would serialize into a header the I-JSON gate refuses is
 * rejected at the point of origin rather than at the recipient, where it would be indistinguishable
 * from tampering.
 */
import { describe, it, expect } from 'vitest';
import { sign, signWire02, verify, validateWire02Header, generateKeypair } from '../src/jws';
import { MAX_KID_UTF8_BYTES } from '../src/kid';

const enc = new TextEncoder();

const PAYLOAD = {
  peac_version: '0.2',
  kind: 'evidence',
  type: 'org.example/kid-validation',
  iss: 'https://issuer.example',
  jti: '01940000-0000-7000-8000-000000000001',
  iat: 1_700_000_000,
};

/** A string of exactly n UTF-8 bytes built from a repeated code point of the given byte width. */
function kidOfBytes(n: number, width: 1 | 2 | 3 | 4): string {
  const ch = width === 1 ? 'a' : width === 2 ? 'é' : width === 3 ? 'ࠀ' : '\u{1F600}';
  const whole = Math.floor(n / width);
  return ch.repeat(whole) + 'a'.repeat(n - whole * width);
}

function header(kid: string): Record<string, unknown> {
  return { typ: 'interaction-record+jwt', alg: 'EdDSA', kid };
}

// BOTH signing entry points must enforce the rule. A rule applied to only one of them leaves the
// other able to mint a record the canonical verifier rejects.
const SIGNERS: Array<[string, (p: unknown, k: Uint8Array, kid: string) => Promise<string>]> = [
  ['sign', sign],
  ['signWire02', signWire02],
];

describe.each(SIGNERS)('%s rejects a malformed kid', (_name, signer) => {
  it.each([
    ['unpaired high surrogate', '\uD83D'],
    ['unpaired low surrogate', '\uDC00'],
    ['high surrogate after ascii', 'k\uD83D'],
    ['low surrogate before ascii', '\uDC00k'],
    ['empty', ''],
  ])('%s', async (_label, kid) => {
    const { privateKey } = await generateKeypair();
    await expect(signer(PAYLOAD, privateKey, kid)).rejects.toMatchObject({
      code: 'CRYPTO_JWS_MISSING_KID',
    });
  });

  it('kid of 257 UTF-8 bytes, in every code-point width', async () => {
    const { privateKey } = await generateKeypair();
    for (const width of [1, 2, 3, 4] as const) {
      const kid = kidOfBytes(257, width);
      expect(enc.encode(kid).length).toBe(257);
      await expect(signer(PAYLOAD, privateKey, kid)).rejects.toMatchObject({
        code: 'CRYPTO_JWS_MISSING_KID',
      });
    }
  });
});

describe('validateWire02Header rejects the same values', () => {
  it.each([
    ['unpaired high surrogate', '\uD83D'],
    ['unpaired low surrogate', '\uDC00'],
    ['empty', ''],
  ])('%s', (_label, kid) => {
    expect(() => validateWire02Header(header(kid))).toThrowError(
      expect.objectContaining({ code: 'CRYPTO_JWS_MISSING_KID' })
    );
  });

  it('257 UTF-8 bytes', () => {
    expect(() => validateWire02Header(header(kidOfBytes(257, 3)))).toThrowError(
      expect.objectContaining({ code: 'CRYPTO_JWS_MISSING_KID' })
    );
  });

  it('accepts 256 UTF-8 bytes in every code-point width', () => {
    for (const width of [1, 2, 3, 4] as const) {
      const kid = kidOfBytes(256, width);
      expect(enc.encode(kid).length).toBe(256);
      expect(() => validateWire02Header(header(kid))).not.toThrow();
    }
  });
});

describe('sign and verify agree on the accepted set', () => {
  it('a 256-byte multibyte kid produces a record the canonical verifier accepts', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = kidOfBytes(MAX_KID_UTF8_BYTES, 3);
    expect(enc.encode(kid).length).toBe(MAX_KID_UTF8_BYTES);
    expect(kid.length).toBeLessThan(MAX_KID_UTF8_BYTES); // fewer code units than bytes

    const jws = await signWire02(PAYLOAD, privateKey, kid);
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect((result.header as { kid: string }).kid).toBe(kid);
  });

  it('an astral kid at exactly the bound round-trips', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = '\u{1F600}'.repeat(64); // 128 code units, 256 bytes
    const jws = await signWire02(PAYLOAD, privateKey, kid);
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
    expect((result.header as { kid: string }).kid).toBe(kid);
  });

  it('every kid the signer accepts survives a UTF-8 round trip', () => {
    // The property that makes the signing invariant hold: a value that does not round-trip would be
    // emitted by JSON.stringify as an escape, and the resulting header fails the I-JSON gate.
    for (const width of [1, 2, 3, 4] as const) {
      const kid = kidOfBytes(256, width);
      expect(new TextDecoder().decode(enc.encode(kid))).toBe(kid);
    }
  });
});
