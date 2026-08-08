/**
 * Issuance/verification I-JSON symmetry.
 *
 * The verifier applies the RFC 7493 I-JSON gate to the decoded header and payload bytes (Wire 0.2
 * Section 10.6). The signer must apply the identical gate to the exact bytes it signs, so that a
 * PEAC signing API can never emit a compact JWS its own verifier rejects as non-I-JSON. These tests
 * assert rejection happens at issuance (the thrown code is a serialization-stage code, raised before
 * Ed25519 signing) and that a successful sign always clears the verifier's raw I-JSON gate. Non-ASCII
 * inputs are written with explicit escapes so their code points do not depend on file encoding.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { sign, signWire02, verify, generateKeypair } from '../src/jws';
import { CryptoError } from '../src/errors';

const payload = {
  peac_version: '0.2',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  iss: 'https://api.example.com',
  iat: 1709500000,
  jti: 'issuance-ijson-001',
} as const;

// Codes raised while serializing/validating a segment, i.e. strictly before Ed25519 signing.
const PRE_SIGN_CODES = new Set([
  'CRYPTO_IJSON_INVALID_STRING',
  'CRYPTO_IJSON_DUPLICATE_MEMBER_NAME',
  'CRYPTO_IJSON_NUMBER_OUT_OF_RANGE',
  'CRYPTO_INVALID_JWS_FORMAT',
  'CRYPTO_JWS_MISSING_KID',
]);

let privateKey: Uint8Array;
let publicKey: Uint8Array;
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeypair());
});

const NONCHAR_FDD0 = '\uFDD0';
const NONCHAR_FFFF = '\uFFFF';
const LONE_SURROGATE = '\uD800';

async function expectPreSignRejection(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(CryptoError);
    expect(PRE_SIGN_CODES.has((err as CryptoError).code), `code ${(err as CryptoError).code}`).toBe(
      true
    );
    return;
  }
  throw new Error('expected issuance to reject, but it succeeded');
}

describe('valid issuance still signs, verifies, and clears the I-JSON gate', () => {
  it('ordinary ASCII kid', async () => {
    await expect(
      verify(await signWire02(payload, privateKey, 'key-1'), publicKey)
    ).resolves.toBeDefined();
  });

  it('supplementary-plane kid within 256 UTF-8 bytes', async () => {
    const jws = await signWire02(payload, privateKey, '\u{1F600}'.repeat(4));
    await expect(verify(jws, publicKey)).resolves.toBeDefined();
  });

  it('payload with a well-formed non-ASCII string', async () => {
    const jws = await signWire02({ ...payload, jti: 'r\u00e9f-\u{1F600}' }, privateKey, 'key-1');
    await expect(verify(jws, publicKey)).resolves.toBeDefined();
  });
});

describe('non-I-JSON issuance is rejected at the serialization stage', () => {
  // The thrown code is raised while serializing/validating the segment, i.e. by serializeIJsonSegment,
  // which runs before ed25519 signing. That is asserted through the code, not by claiming zero calls.
  it('kid containing a U+FDD0 noncharacter', () =>
    expectPreSignRejection(() => signWire02(payload, privateKey, `k${NONCHAR_FDD0}`)));
  it('kid containing a U+FFFF noncharacter', () =>
    expectPreSignRejection(() => signWire02(payload, privateKey, `k${NONCHAR_FFFF}`)));
  it('kid containing a lone surrogate', () =>
    expectPreSignRejection(() => signWire02(payload, privateKey, `k${LONE_SURROGATE}`)));
  it('payload string containing a noncharacter', () =>
    expectPreSignRejection(() =>
      signWire02({ ...payload, jti: `x${NONCHAR_FDD0}` }, privateKey, 'key-1')
    ));
  it('payload string containing a lone surrogate', () =>
    expectPreSignRejection(() =>
      signWire02({ ...payload, jti: `x${LONE_SURROGATE}` }, privateKey, 'key-1')
    ));
  it('Wire 0.1 payload containing a noncharacter', () =>
    expectPreSignRejection(() => sign({ x: `y${NONCHAR_FDD0}` }, privateKey, 'key-1')));

  it('payload number outside the I-JSON interoperable range is rejected', async () => {
    // 2^53 exceeds MAX_SAFE_INTEGER; assertIJson rejects it, so the signer must too. This proves the
    // gate is the whole I-JSON contract, not a Unicode-only check. The verifier rejects the same.
    await expectPreSignRejection(() => sign({ n: 9007199254740992 }, privateKey, 'key-1'));
  });

  it('a payload that cannot be serialized to JSON text is rejected', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const throwingToJson = {
      toJSON() {
        throw new Error('boom');
      },
    };
    const throwingGetter = Object.defineProperty({}, 'g', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    // JSON.stringify returns no text (undefined/function/symbol) or throws (BigInt, cyclic, a
    // throwing toJSON or getter). All map to a stable code with no engine or caller text leaked.
    const bad: unknown[] = [
      undefined,
      () => {},
      Symbol('x'),
      10n,
      cyclic,
      throwingToJson,
      throwingGetter,
    ];
    for (const value of bad) {
      await expectPreSignRejection(() => sign(value, privateKey, 'key-1'));
    }
  });
});

describe('byte identity for accepted inputs', () => {
  it('a fixed key and payload produce the exact compact JWS', async () => {
    // Deterministic regression: Ed25519 signing is deterministic, and the refactor encodes the same
    // serialized bytes it validates, so accepted inputs must produce byte-identical output. A change
    // to the serialization would change this golden value.
    const fixedKey = new Uint8Array(32).fill(7);
    const fixed = {
      peac_version: '0.2',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      iss: 'https://api.example.com',
      iat: 1709500000,
      jti: 'byte-identity-001',
    };
    const jws = await signWire02(fixed, fixedKey, 'golden-key');
    expect(jws).toBe(
      'eyJ0eXAiOiJpbnRlcmFjdGlvbi1yZWNvcmQrand0IiwiYWxnIjoiRWREU0EiLCJraWQiOiJnb2xkZW4ta2V5In0.eyJwZWFjX3ZlcnNpb24iOiIwLjIiLCJraW5kIjoiZXZpZGVuY2UiLCJ0eXBlIjoib3JnLnBlYWNwcm90b2NvbC9wYXltZW50IiwiaXNzIjoiaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20iLCJpYXQiOjE3MDk1MDAwMDAsImp0aSI6ImJ5dGUtaWRlbnRpdHktMDAxIn0.IVr_LpFbu7pMC7htTcP389u0_UP1BQLPHqduhpyBqIqS6nmybB5DDVHSog-W8H-9MplK4JBJcVZSwpeyO2j-BQ'
    );
  });
});

describe('round-trip invariant', () => {
  it('every JWS a signer emits clears the verifier raw I-JSON gate', async () => {
    const kids = ['a', 'key-1', '\u00e9', '\u{1F600}'.repeat(4), 'a'.repeat(256)];
    for (const kid of kids) {
      const jws = await signWire02(payload, privateKey, kid);
      await expect(
        verify(jws, publicKey),
        `kid ${JSON.stringify(kid).slice(0, 20)}`
      ).resolves.toBeDefined();
    }
  });
});
