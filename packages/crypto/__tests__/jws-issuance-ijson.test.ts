/**
 * Issuance/verification I-JSON symmetry.
 *
 * The verifier applies the RFC 7493 I-JSON gate to the decoded header and payload bytes (Wire 0.2
 * Section 10.6). The signer must apply the identical gate to the exact bytes it signs, so that a
 * PEAC signing API can never emit a compact JWS its own verifier rejects as non-I-JSON. These tests
 * assert that non-admissible input is rejected during segment serialization/validation, with the
 * exact stable code for each case, and that any JWS a signer does emit is admitted by the verifier
 * AND carries a valid Ed25519 signature. The rejection code identifies which validation stage
 * refused the input; the tests do not instrument the signer and make no claim about signing calls.
 * Non-ASCII inputs are written with explicit escapes so their code points do not depend on file
 * encoding.
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

let privateKey: Uint8Array;
let publicKey: Uint8Array;
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeypair());
});

const NONCHAR_FDD0 = '\uFDD0';
const NONCHAR_FFFF = '\uFFFF';
const LONE_SURROGATE = '\uD800';

/**
 * Assert that issuance is refused during segment serialization/validation with an EXACT code. An
 * allow-set would let a regression take the wrong rejection path and still pass, so every vector
 * pins the one code the current implementation is confirmed to raise.
 */
async function expectIssuanceRejection(
  run: () => Promise<unknown>,
  expectedCode: string
): Promise<void> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(CryptoError);
    expect((err as CryptoError).code).toBe(expectedCode);
    return;
  }
  throw new Error(`expected issuance to reject with ${expectedCode}, but it succeeded`);
}

describe('valid issuance signs, is admitted by the verifier, and has a valid signature', () => {
  it('ordinary ASCII kid', async () => {
    const result = await verify(await signWire02(payload, privateKey, 'key-1'), publicKey);
    expect(result.valid).toBe(true);
  });

  it('supplementary-plane kid within 256 UTF-8 bytes', async () => {
    const jws = await signWire02(payload, privateKey, '\u{1F600}'.repeat(4));
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
  });

  it('payload with a well-formed non-ASCII string', async () => {
    const jws = await signWire02({ ...payload, jti: 'r\u00e9f-\u{1F600}' }, privateKey, 'key-1');
    const result = await verify(jws, publicKey);
    expect(result.valid).toBe(true);
  });
});

describe('non-I-JSON issuance is rejected during segment serialization/validation', () => {
  // A noncharacter reaches the kid header and is refused by the I-JSON string gate; a lone surrogate
  // is refused earlier by the kid rule (an unpaired surrogate is not well-formed Unicode), which is
  // why the two kid cases carry different codes.
  it('kid containing a U+FDD0 noncharacter', () =>
    expectIssuanceRejection(
      () => signWire02(payload, privateKey, `k${NONCHAR_FDD0}`),
      'CRYPTO_IJSON_INVALID_STRING'
    ));
  it('kid containing a U+FFFF noncharacter', () =>
    expectIssuanceRejection(
      () => signWire02(payload, privateKey, `k${NONCHAR_FFFF}`),
      'CRYPTO_IJSON_INVALID_STRING'
    ));
  it('kid containing a lone surrogate', () =>
    expectIssuanceRejection(
      () => signWire02(payload, privateKey, `k${LONE_SURROGATE}`),
      'CRYPTO_JWS_MISSING_KID'
    ));
  it('payload string containing a noncharacter', () =>
    expectIssuanceRejection(
      () => signWire02({ ...payload, jti: `x${NONCHAR_FDD0}` }, privateKey, 'key-1'),
      'CRYPTO_IJSON_INVALID_STRING'
    ));
  it('payload string containing a lone surrogate', () =>
    expectIssuanceRejection(
      () => signWire02({ ...payload, jti: `x${LONE_SURROGATE}` }, privateKey, 'key-1'),
      'CRYPTO_IJSON_INVALID_STRING'
    ));
  it('Wire 0.1 payload containing a noncharacter', () =>
    expectIssuanceRejection(
      () => sign({ x: `y${NONCHAR_FDD0}` }, privateKey, 'key-1'),
      'CRYPTO_IJSON_INVALID_STRING'
    ));

  it('payload number outside the PEAC safe-numeric-range admission rule is rejected', async () => {
    // 2^53 exceeds MAX_SAFE_INTEGER. PEAC's existing raw JSON/I-JSON admission gate hard-rejects it
    // (RFC 7493 recommends SHOULD NOT beyond binary64 interoperability; PEAC is stricter), so the
    // signer must too. This proves the gate is the whole admission contract, not a Unicode-only
    // check. The verifier rejects the identical bytes with the same code.
    await expectIssuanceRejection(
      () => sign({ n: 9007199254740992 }, privateKey, 'key-1'),
      'CRYPTO_IJSON_NUMBER_OUT_OF_RANGE'
    );
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
    // throwing toJSON or getter). All map to one stable code with no engine or caller text leaked.
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
      await expectIssuanceRejection(
        () => sign(value, privateKey, 'key-1'),
        'CRYPTO_INVALID_JWS_FORMAT'
      );
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
  it('every JWS a signer emits is admitted by the verifier with a valid signature', async () => {
    const kids = ['a', 'key-1', '\u00e9', '\u{1F600}'.repeat(4), 'a'.repeat(256)];
    for (const kid of kids) {
      const jws = await signWire02(payload, privateKey, kid);
      const result = await verify(jws, publicKey);
      expect(result.valid, `kid ${JSON.stringify(kid).slice(0, 20)}`).toBe(true);
    }
  });
});
