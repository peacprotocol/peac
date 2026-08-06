/**
 * Ed25519 verification-profile parity tests against the shared corpus at
 * specs/conformance/parity-corpus/ed25519-peac-profile/.
 *
 * The corpus is the single source of truth for the cross-language Ed25519
 * accept/reject contract; the Go implementation in
 * sdks/go/ed25519_peac_profile_parity_test.go runs the same vectors and
 * must reach identical decisions.
 *
 * The asserted field is `peac_expected.accepted`: the TypeScript verifier
 * must reproduce it for every vector. The per-vector `empirical` block is
 * diagnostic provenance (how several libraries actually decide the vector)
 * and is not asserted here.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { verify, sign, getPublicKey, Ed25519RuntimeError } from '../src/ed25519.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(
  __dirname,
  '../../../specs/conformance/parity-corpus/ed25519-peac-profile/vectors.json'
);

interface Empirical {
  noble_zip215: boolean;
  noble_strict: boolean;
  curves_strict: boolean;
  node_native: boolean;
  webcrypto: boolean;
  peac_profile: boolean;
}

interface Vector {
  id: string;
  source: string;
  description: string;
  message_hex: string;
  public_key_hex: string;
  signature_hex: string;
  peac_expected: { accepted: boolean };
  empirical: Empirical;
}

interface Corpus {
  family: string;
  description: string;
  version: string;
  vectors: Vector[];
}

const corpus: Corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));

function hex(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, 'hex'));
}

async function verifyVector(v: Vector): Promise<boolean> {
  return verify(hex(v.signature_hex), hex(v.message_hex), hex(v.public_key_hex));
}

describe('Ed25519 verification-profile parity corpus (TypeScript side)', () => {
  it('loads the expected corpus', () => {
    expect(corpus.family).toBe('ed25519-peac-profile');
    // 12 speccheck edge vectors + 1 RFC 8032 positive + 1 PEAC-sign positive.
    expect(corpus.vectors).toHaveLength(14);
    const ids = new Set(corpus.vectors.map((v) => v.id));
    expect(ids.size).toBe(corpus.vectors.length); // unique ids
  });

  for (const v of corpus.vectors) {
    it(`${v.id} -> ${v.peac_expected.accepted ? 'accept' : 'reject'} (${v.description})`, async () => {
      const result = await verifyVector(v);
      expect(result).toBe(v.peac_expected.accepted);
    });
  }

  // Named guards on the load-bearing edge classes. These pin WHY each class
  // is rejected, so a future regression names the cause, not just a count.

  it('rejects small-order public keys (the denylist is load-bearing)', async () => {
    // speccheck 0, 1, 11 carry small-order public keys that Go stdlib and Web
    // Crypto accept at the raw-verify layer; the shared denylist rejects them.
    for (const id of ['speccheck-0', 'speccheck-1', 'speccheck-11']) {
      const v = corpus.vectors.find((x) => x.id === id);
      expect(v, `${id} present`).toBeDefined();
      expect(v!.peac_expected.accepted, `${id} expected reject`).toBe(false);
      expect(await verifyVector(v!), `${id} verify reject`).toBe(false);
    }
  });

  it('rejects cofactored-only signatures (cofactorless predicate)', async () => {
    // speccheck 4, 5 verify under a cofactored equation but fail cofactorless;
    // a thin noble { zip215: false } wrapper would ACCEPT these and diverge
    // from Go. The cofactorless profile rejects them.
    for (const id of ['speccheck-4', 'speccheck-5']) {
      const v = corpus.vectors.find((x) => x.id === id);
      expect(v, `${id} present`).toBeDefined();
      expect(v!.peac_expected.accepted, `${id} expected reject`).toBe(false);
      expect(await verifyVector(v!), `${id} verify reject`).toBe(false);
    }
  });

  it('accepts canonical positives', async () => {
    for (const id of ['rfc8032-vector-1', 'peac-sign-positive']) {
      const v = corpus.vectors.find((x) => x.id === id);
      expect(v, `${id} present`).toBeDefined();
      expect(v!.peac_expected.accepted, `${id} expected accept`).toBe(true);
      expect(await verifyVector(v!), `${id} verify accept`).toBe(true);
    }
  });

  it('rejects non-reduced scalar S >= L', async () => {
    // speccheck 6, 7, 8 carry S >= L; the malleability guard rejects them
    // before the Web Crypto call.
    for (const id of ['speccheck-6', 'speccheck-7', 'speccheck-8']) {
      const v = corpus.vectors.find((x) => x.id === id);
      expect(v, `${id} present`).toBeDefined();
      expect(await verifyVector(v!), `${id} verify reject`).toBe(false);
    }
  });

  // Live round-trip: every signature produced by sign() must verify, proving
  // the cofactorless profile does not reject canonical PEAC signatures, and
  // that a single-byte tamper is rejected.
  it('verifies a fresh sign() signature and rejects a one-byte tamper', async () => {
    const seed = hex('9d61b19deffebc3df40d9c4ee94a0a3d24a39c70c4c4f4d6f4d5f8c6e5b4a392');
    const pub = await getPublicKey(seed);
    const msg = new TextEncoder().encode('round-trip control message');
    const sigBytes = await sign(msg, seed);
    expect(await verify(sigBytes, msg, pub)).toBe(true);

    const tampered = Uint8Array.from(sigBytes);
    tampered[10] ^= 0x01;
    expect(await verify(tampered, msg, pub)).toBe(false);
  });

  // Fail-closed: if the runtime cannot provide the cofactorless Ed25519
  // primitive, verify() throws Ed25519RuntimeError rather than falling back to
  // a different predicate. We simulate a runtime without Web Crypto by
  // temporarily removing globalThis.crypto.subtle. A canonical positive (which
  // passes every pre-check) is used so the failure can only originate at the
  // Web Crypto boundary, not at an admissibility check.
  it('fails closed (throws) when Web Crypto Ed25519 is unavailable', async () => {
    const v = corpus.vectors.find((x) => x.id === 'peac-sign-positive')!;
    const sig = hex(v.signature_hex);
    const msg = hex(v.message_hex);
    const pub = hex(v.public_key_hex);

    const original = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: { ...original, subtle: undefined },
        configurable: true,
      });
      await expect(verify(sig, msg, pub)).rejects.toBeInstanceOf(Ed25519RuntimeError);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }

    // Sanity: with Web Crypto restored, the same vector verifies. This proves
    // the throw above was caused by the missing primitive, not the vector.
    expect(await verify(sig, msg, pub)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empirical-matrix integrity: the diagnostic provenance in the corpus must not
// silently rot. Assert it agrees with the asserted decision and pins the two
// load-bearing facts (cofactored-only and small-order edge classes).
// ---------------------------------------------------------------------------
describe('Ed25519 verification-profile corpus: empirical-matrix integrity', () => {
  it('empirical.peac_profile equals peac_expected.accepted for every vector', () => {
    for (const v of corpus.vectors) {
      expect(v.empirical, `${v.id} has an empirical block`).toBeDefined();
      expect(v.empirical.peac_profile, `${v.id}: empirical.peac_profile vs peac_expected`).toBe(
        v.peac_expected.accepted
      );
    }
  });

  it('cofactored-only vectors 4 and 5: noble_strict accepts, Go/Web Crypto reject, PEAC rejects', () => {
    for (const id of ['speccheck-4', 'speccheck-5']) {
      const e = corpus.vectors.find((x) => x.id === id)!.empirical;
      expect(e.noble_strict, `${id}: noble {zip215:false} accepts`).toBe(true);
      expect(e.node_native, `${id}: Go-equivalent native rejects`).toBe(false);
      expect(e.webcrypto, `${id}: Web Crypto rejects`).toBe(false);
      expect(e.peac_profile, `${id}: PEAC rejects`).toBe(false);
    }
  });

  it('small-order vectors 0, 1, 11: Web Crypto accepts raw, PEAC rejects (denylist)', () => {
    for (const id of ['speccheck-0', 'speccheck-1', 'speccheck-11']) {
      const e = corpus.vectors.find((x) => x.id === id)!.empirical;
      expect(e.webcrypto, `${id}: Web Crypto accepts raw`).toBe(true);
      expect(e.peac_profile, `${id}: PEAC rejects via denylist`).toBe(false);
    }
  });

  it('canonical positives: every verifier column accepts', () => {
    for (const id of ['rfc8032-vector-1', 'peac-sign-positive']) {
      const e = corpus.vectors.find((x) => x.id === id)!.empirical;
      expect(e.noble_zip215, `${id}: noble ZIP215`).toBe(true);
      expect(e.noble_strict, `${id}: noble strict`).toBe(true);
      expect(e.node_native, `${id}: native`).toBe(true);
      expect(e.webcrypto, `${id}: Web Crypto`).toBe(true);
      expect(e.peac_profile, `${id}: PEAC`).toBe(true);
    }
  });

  it('exactly four corpus vectors carry a rejected small-order public key', () => {
    // The profile rejects eight canonical torsion encodings plus two PEAC mixed-order exclusions.
    // Pin the count against the declared tables so a provenance note cannot drift from reality.
    const source = readFileSync(
      resolve(__dirname, '../src/internal/ed25519-admissibility.ts'),
      'utf8'
    );
    const table = (name: string): string[] => {
      const body = new RegExp(`${name} = Uint8Array\\.from\\(\\[([\\s\\S]*?)\\]\\)`).exec(source);
      expect(body, `${name} not found`).not.toBeNull();
      const bytes = [...body![1].matchAll(/0x([0-9a-f]{2})/g)].map((m) => m[1]);
      const out: string[] = [];
      for (let i = 0; i < bytes.length; i += 32) out.push(bytes.slice(i, i + 32).join(''));
      return out;
    };
    const torsion = table('ED25519_TORSION_POINT_ENCODINGS');
    const mixed = table('PEAC_PROFILE_MIXED_ORDER_REJECTIONS');
    expect(torsion).toHaveLength(8);
    expect(mixed).toHaveLength(2);

    // One of the four is rejected algorithmically rather than by table: its encoding sets the sign
    // bit on y = p - 1, which is the invalid zero-x case. Assert the outcome, not the mechanism,
    // so moving a rule between table and arithmetic does not look like a behaviour change.
    const tabled = new Set([...torsion, ...mixed]);
    const small = corpus.vectors.filter(
      (v) => tabled.has(v.public_key_hex) || (parseInt(v.public_key_hex.slice(62), 16) & 0x80) !== 0
    );
    expect(new Set(small.map((v) => v.public_key_hex)).size).toBe(2);
    expect(small.map((v) => v.id).sort()).toEqual([
      'speccheck-0',
      'speccheck-1',
      'speccheck-10',
      'speccheck-11',
    ]);
  });

  it('the profile applies the same tables to the signature R component', () => {
    // The regression this change repairs: R was never subjected to the check A already had.
    const source = readFileSync(
      resolve(__dirname, '../src/internal/ed25519-admissibility.ts'),
      'utf8'
    );
    expect(source).toContain('ED25519_TORSION_POINT_ENCODINGS');
    expect(source).toContain('PEAC_PROFILE_MIXED_ORDER_REJECTIONS');
    const verifySource = readFileSync(resolve(__dirname, '../src/ed25519.ts'), 'utf8');
    expect(verifySource).toContain('isRejectedEd25519PointEncoding(publicKey)');
    expect(verifySource).toContain(
      'isRejectedEd25519PointEncoding(signature.subarray(0, ED25519_PUBLIC_KEY_BYTES))'
    );
  });
});
