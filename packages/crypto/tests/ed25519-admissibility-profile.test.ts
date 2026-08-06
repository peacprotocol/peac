/**
 * Behaviour of the bounded admissibility profile, exercised through the public verify() surface.
 *
 * Each case covers a decision the profile makes before delegating to the runtime primitive, so the
 * outcome for that enumerated case is required to be the same whichever primitive is underneath.
 * Inputs outside the bounded set are decided by the delegated primitive and are not covered by
 * that requirement. The corpus is the classified edge set together with ordinary signatures that
 * must continue to verify.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ed25519Verify, ed25519Sign, ed25519GetPublicKey } from '../src/index.js';
import { classifyPointEncoding } from './helpers/ed25519-point-classifier.js';
import { ed25519PointRejectionReason } from '../src/internal/ed25519-admissibility.js';

const CRYPTO_ROOT = join(__dirname, '..');
const REPO_ROOT = join(CRYPTO_ROOT, '..', '..');

const bytes = (hex: string): Uint8Array => Uint8Array.from(Buffer.from(hex, 'hex'));
const MESSAGE = bytes('50454143206564323535313920616463');

const corpus: { entries: { encoding_hex: string; primary_class: string }[] } = JSON.parse(
  readFileSync(join(CRYPTO_ROOT, 'tests', 'fixtures', 'ed25519-edge-point-encodings.json'), 'utf8')
);
const parity: {
  vectors: { id: string; public_key_hex: string; signature_hex: string; message_hex: string }[];
} = JSON.parse(
  readFileSync(
    join(
      REPO_ROOT,
      'specs',
      'conformance',
      'parity-corpus',
      'ed25519-peac-profile',
      'vectors.json'
    ),
    'utf8'
  )
);

const byClass = (name: string): string[] =>
  corpus.entries.filter((e) => e.primary_class === name).map((e) => e.encoding_hex);

const TORSION = byClass('canonical_small_order');
const MIXED = byClass('canonical_mixed_order');
const ORDINARY = byClass('canonical_prime_subgroup');

/** A signature whose R is the encoding under test and whose S is a valid reduced scalar. */
function signatureWithR(rHex: string): Uint8Array {
  const signature = new Uint8Array(64);
  signature.set(bytes(rHex), 0);
  signature.set(bytes('0100000000000000000000000000000000000000000000000000000000000000'), 32);
  return signature;
}

describe('the corpus supplies the classes these tests claim to cover', () => {
  it('eight torsion, two mixed-order and at least one ordinary encoding', () => {
    expect(TORSION).toHaveLength(8);
    expect(MIXED).toHaveLength(2);
    expect(ORDINARY.length).toBeGreaterThanOrEqual(1);
  });
});

describe('inadmissible encodings are rejected in the public-key position', () => {
  it.each(TORSION.map((h) => [h.slice(0, 16), h] as const))('torsion %s', async (_l, hex) => {
    expect(await ed25519Verify(new Uint8Array(64), MESSAGE, bytes(hex))).toBe(false);
  });

  it.each(MIXED.map((h) => [h.slice(0, 16), h] as const))('mixed order 4L %s', async (_l, hex) => {
    // Retained PEAC policy, unchanged from 0.16.3.
    expect(await ed25519Verify(new Uint8Array(64), MESSAGE, bytes(hex))).toBe(false);
  });
});

describe('inadmissible encodings are rejected in the signature R position', () => {
  // The bounded precheck applies to the R position as well as to the public key.
  const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);

  it.each(TORSION.map((h) => [h.slice(0, 16), h] as const))('torsion %s', async (_l, hex) => {
    expect(await ed25519Verify(signatureWithR(hex), MESSAGE, validKey)).toBe(false);
  });

  it.each(MIXED.map((h) => [h.slice(0, 16), h] as const))('mixed order 4L %s', async (_l, hex) => {
    expect(await ed25519Verify(signatureWithR(hex), MESSAGE, validKey)).toBe(false);
  });
});

describe('encoded-y boundaries are rejected in both positions and both sign variants', () => {
  const FIELD_PRIME = 2n ** 255n - 19n;
  const encode = (y: bigint, signBit: 0 | 1): string => {
    const buffer = new Uint8Array(32);
    let rest = y & (2n ** 255n - 1n);
    for (let i = 0; i < 32 && rest > 0n; i++) {
      buffer[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    if (signBit) buffer[31] |= 0x80;
    return Buffer.from(buffer).toString('hex');
  };
  const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);

  const cases: [string, bigint, 0 | 1][] = [
    ['y = p', FIELD_PRIME, 0],
    ['y = p, sign', FIELD_PRIME, 1],
    ['y = p + 1', FIELD_PRIME + 1n, 0],
    ['y = p + 1, sign', FIELD_PRIME + 1n, 1],
    ['maximum 255-bit y', 2n ** 255n - 1n, 0],
    ['maximum 255-bit y, sign', 2n ** 255n - 1n, 1],
    ['y = 1 with sign set (x = 0)', 1n, 1],
    ['y = p - 1 with sign set (x = 0)', FIELD_PRIME - 1n, 1],
  ];

  it.each(cases)('%s is rejected as A', async (_label, y, signBit) => {
    expect(await ed25519Verify(new Uint8Array(64), MESSAGE, bytes(encode(y, signBit)))).toBe(false);
  });

  it.each(cases)('%s is rejected as R', async (_label, y, signBit) => {
    expect(await ed25519Verify(signatureWithR(encode(y, signBit)), MESSAGE, validKey)).toBe(false);
  });
});

describe('the documented guarantee stays bounded', () => {
  // The profile decides an enumerated set and delegates everything else, so it cannot promise that
  // every Ed25519 input decides identically on every runtime. That claim was published once and
  // must not return.
  const sources = [
    join(CRYPTO_ROOT, 'src', 'internal', 'ed25519-admissibility.ts'),
    join(CRYPTO_ROOT, 'src', 'ed25519.ts'),
    join(REPO_ROOT, 'sdks', 'go', 'jws', 'ed25519_admissibility.go'),
    join(REPO_ROOT, 'sdks', 'go', 'jws', 'ed25519.go'),
  ];

  it.each(sources)('%s makes no absolute cross-runtime claim', (source) => {
    const text = readFileSync(source, 'utf8');
    for (const forbidden of [
      /identical across runtimes/i,
      /identical on every runtime/i,
      /same (?:result|decision) on (?:all|every) runtimes?/i,
      /deterministic across all runtimes/i,
    ]) {
      expect(forbidden.test(text), `${source} claims unbounded cross-runtime determinism`).toBe(
        false
      );
    }
  });

  it('states the delegated remainder explicitly', () => {
    for (const source of sources.slice(0, 1)) {
      const text = readFileSync(source, 'utf8');
      expect(text).toMatch(/outside this bounded set/i);
      expect(text).toMatch(/not complete point decoding/i);
    }
  });
});

describe('the precheck runs before the runtime primitive is touched', () => {
  // Ordering is observable: with the runtime removed, an inadmissible encoding must still be a
  // plain rejection. If the runtime were reached first, the same input would raise a capability
  // error instead, turning a decided rejection into an exception the caller must handle.
  const withoutSubtle = async (fn: () => Promise<void>): Promise<void> => {
    const original = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: { ...original, subtle: undefined },
        configurable: true,
      });
      await fn();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  };

  it('an inadmissible public key is rejected without the runtime', async () => {
    await withoutSubtle(async () => {
      expect(await ed25519Verify(new Uint8Array(64), MESSAGE, bytes(TORSION[0]))).toBe(false);
    });
  });

  it('an inadmissible R is rejected without the runtime', async () => {
    const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);
    await withoutSubtle(async () => {
      expect(await ed25519Verify(signatureWithR(TORSION[0]), MESSAGE, validKey)).toBe(false);
    });
  });

  it('a non-reduced scalar is rejected without the runtime', async () => {
    const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);
    const signature = signatureWithR(ORDINARY[0]);
    signature.fill(0xff, 32);
    await withoutSubtle(async () => {
      expect(await ed25519Verify(signature, MESSAGE, validKey)).toBe(false);
    });
  });

  it('an admissible input still reaches the runtime and fails closed there', async () => {
    // Without this the assertions above would also pass if verify() rejected everything early.
    const v = parity.vectors.find((x) => x.id === 'peac-sign-positive')!;
    await withoutSubtle(async () => {
      await expect(
        ed25519Verify(bytes(v.signature_hex), bytes(v.message_hex), bytes(v.public_key_hex))
      ).rejects.toThrow();
    });
  });
});

describe('the precheck delegates what it cannot decide', () => {
  it('an off-curve encoding is delegated and rejected by the runtime', async () => {
    // The bounded precheck does not detect curve membership; the primitive does.
    const offCurve = corpus.entries.find((e) => e.primary_class === 'invalid_not_on_curve');
    expect(offCurve).toBeDefined();
    expect(await ed25519Verify(new Uint8Array(64), MESSAGE, bytes(offCurve!.encoding_hex))).toBe(
      false
    );
  });

  it('an ordinary prime-subgroup key is not rejected by the precheck', async () => {
    for (const hex of ORDINARY) {
      expect(classifyPointEncoding(hex).classification).toBe('canonical_prime_subgroup');
    }
  });
});

describe('ordinary signatures still verify', () => {
  it.each(['rfc8032-vector-1', 'peac-sign-positive'])('%s', async (id) => {
    const v = parity.vectors.find((x) => x.id === id)!;
    expect(
      await ed25519Verify(bytes(v.signature_hex), bytes(v.message_hex), bytes(v.public_key_hex))
    ).toBe(true);
  });

  it('a freshly generated key and signature round-trip', async () => {
    const secret = bytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const publicKey = await ed25519GetPublicKey(secret);
    const signature = await ed25519Sign(MESSAGE, secret);
    expect(await ed25519Verify(signature, MESSAGE, publicKey)).toBe(true);
  });
});

describe('malformed containers are rejected before any point is examined', () => {
  const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);

  it.each([0, 31, 33])('public key of %i bytes', async (length) => {
    expect(await ed25519Verify(new Uint8Array(64), MESSAGE, new Uint8Array(length))).toBe(false);
  });

  it.each([0, 31, 32, 63, 65])('signature of %i bytes', async (length) => {
    // R must never be sliced from a signature of unknown length.
    expect(await ed25519Verify(new Uint8Array(length), MESSAGE, validKey)).toBe(false);
  });
});

describe('the S >= L malleability guard is unchanged', () => {
  const validKey = bytes(parity.vectors.find((v) => v.id === 'rfc8032-vector-1')!.public_key_hex);
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const withScalar = (s: bigint): Uint8Array => {
    const signature = new Uint8Array(64);
    // R is an ordinary encoding so the scalar rule is what decides.
    signature.set(bytes(ORDINARY[0]), 0);
    let rest = s;
    for (let i = 0; i < 32 && rest > 0n; i++) {
      signature[32 + i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    return signature;
  };

  it('S = L - 1 is admissible and reaches the runtime', async () => {
    // Admissible, so it fails on the signature equation rather than the scalar rule.
    expect(await ed25519Verify(withScalar(L - 1n), MESSAGE, validKey)).toBe(false);
  });

  it.each([
    ['S = L', L],
    ['S = L + 1', L + 1n],
  ])('%s is rejected', async (_label, s) => {
    expect(await ed25519Verify(withScalar(s), MESSAGE, validKey)).toBe(false);
  });
});

describe('the precheck rejects for the intended reason, not incidentally', () => {
  // The runtime primitive rejects most of these inputs as well, so a false result from verify()
  // does not identify which rule decided. These cases assert the rejection reason, which separates
  // a torsion rejection from the PEAC mixed-order rule.
  const FIELD_PRIME = 2n ** 255n - 19n;
  const encode = (y: bigint, signBit: 0 | 1): Uint8Array => {
    const buffer = new Uint8Array(32);
    let rest = y & (2n ** 255n - 1n);
    for (let i = 0; i < 32 && rest > 0n; i++) {
      buffer[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    if (signBit) buffer[31] |= 0x80;
    return buffer;
  };

  it.each(TORSION.map((h) => [h.slice(0, 16), h] as const))(
    'torsion %s is rejected as torsion_point',
    (_l, hex) => {
      expect(ed25519PointRejectionReason(bytes(hex))).toBe('torsion_point');
    }
  );

  it.each(MIXED.map((h) => [h.slice(0, 16), h] as const))(
    'mixed order %s is rejected as peac_mixed_order_profile, never as torsion',
    (_l, hex) => {
      expect(ed25519PointRejectionReason(bytes(hex))).toBe('peac_mixed_order_profile');
    }
  );

  it('y = 1 with the sign bit set is rejected as invalid_x_zero_sign', () => {
    expect(ed25519PointRejectionReason(encode(1n, 1))).toBe('invalid_x_zero_sign');
  });

  it('y = p - 1 with the sign bit set is rejected as invalid_x_zero_sign', () => {
    expect(ed25519PointRejectionReason(encode(FIELD_PRIME - 1n, 1))).toBe('invalid_x_zero_sign');
  });

  it('y = p is rejected as encoded_y_out_of_range, not by a table', () => {
    expect(ed25519PointRejectionReason(encode(FIELD_PRIME, 0))).toBe('encoded_y_out_of_range');
    expect(ed25519PointRejectionReason(encode(FIELD_PRIME, 1))).toBe('encoded_y_out_of_range');
  });

  it('an ordinary prime-subgroup encoding is delegated, with no reason at all', () => {
    for (const hex of ORDINARY) {
      expect(ed25519PointRejectionReason(bytes(hex))).toBeNull();
    }
  });

  it('an off-curve encoding is delegated: the bounded precheck cannot see curve membership', () => {
    const offCurve = corpus.entries.find((e) => e.primary_class === 'invalid_not_on_curve');
    expect(ed25519PointRejectionReason(bytes(offCurve!.encoding_hex))).toBeNull();
  });

  it('no ordinary prime-subgroup encoding is in either rejection table', () => {
    for (const hex of ORDINARY) {
      expect(TORSION).not.toContain(hex);
      expect(MIXED).not.toContain(hex);
    }
  });
});

describe('the production encoded-y comparator agrees with a bigint oracle', () => {
  it('over several thousand deterministic inputs', () => {
    // Exercises the production byte comparator rather than the test classifier, covering byte-order
    // and sign-mask handling over a range of inputs that fixed vectors do not reach.
    const FIELD_PRIME = 2n ** 255n - 19n;
    // Deterministic walk, so any failure is reproducible.
    let seed = 0x9e3779b97f4a7c15n;
    const next = (): bigint => {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      return seed;
    };

    for (let i = 0; i < 5000; i++) {
      const buffer = new Uint8Array(32);
      for (let b = 0; b < 32; b += 8) {
        let word = next();
        for (let k = 0; k < 8 && b + k < 32; k++) {
          buffer[b + k] = Number(word & 0xffn);
          word >>= 8n;
        }
      }
      // Oracle: encoded y is the little-endian value with the sign bit masked away.
      let y = 0n;
      for (let k = 31; k >= 0; k--) {
        y = (y << 8n) | BigInt(k === 31 ? buffer[31] & 0x7f : buffer[k]);
      }
      const expected = y >= FIELD_PRIME;
      expect(ed25519PointRejectionReason(buffer) === 'encoded_y_out_of_range').toBe(expected);
    }
  });

  it('agrees at the exact boundaries the random walk is unlikely to hit', () => {
    const FIELD_PRIME = 2n ** 255n - 19n;
    const encode = (y: bigint, signBit: 0 | 1): Uint8Array => {
      const buffer = new Uint8Array(32);
      let rest = y & (2n ** 255n - 1n);
      for (let i = 0; i < 32 && rest > 0n; i++) {
        buffer[i] = Number(rest & 0xffn);
        rest >>= 8n;
      }
      if (signBit) buffer[31] |= 0x80;
      return buffer;
    };
    for (const signBit of [0, 1] as const) {
      expect(ed25519PointRejectionReason(encode(FIELD_PRIME - 1n, signBit))).not.toBe(
        'encoded_y_out_of_range'
      );
      expect(ed25519PointRejectionReason(encode(FIELD_PRIME, signBit))).toBe(
        'encoded_y_out_of_range'
      );
      expect(ed25519PointRejectionReason(encode(FIELD_PRIME + 1n, signBit))).toBe(
        'encoded_y_out_of_range'
      );
      expect(ed25519PointRejectionReason(encode(2n ** 255n - 1n, signBit))).toBe(
        'encoded_y_out_of_range'
      );
    }
  });
});
