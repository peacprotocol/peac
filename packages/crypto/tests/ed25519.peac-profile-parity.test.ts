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
 * must reproduce it for every vector. Measured runtime behaviour lives in the
 * sibling runtime-observations.json and is evidence only.
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

interface Observation {
  implementation: string;
  version: string;
  platform: string;
  observed_at: string;
  accepted: boolean | null;
  unsupported?: boolean;
}

interface Vector {
  id: string;
  source: string;
  description: string;
  message_hex: string;
  public_key_hex: string;
  signature_hex: string;
  peac_expected: {
    accepted: boolean;
    regression_reason?: string;
    profile_findings?: string[];
  };
}

interface Corpus {
  family: string;
  description: string;
  corpus_schema_version: number;
  profile_revision: string;
  release_status: string;
  status: string;
  vectors: Vector[];
}

const corpus: Corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'));

const OBSERVATIONS_PATH = resolve(
  __dirname,
  '../../../specs/conformance/parity-corpus/ed25519-peac-profile/runtime-observations.json'
);
const evidence: ObservationDocument = JSON.parse(readFileSync(OBSERVATIONS_PATH, 'utf8'));

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
// Empirical observations are evidence; peac_expected is the only normative
// field. These tests keep the recorded evidence complete and keep the
// load-bearing cross-implementation divergences visible.
// ---------------------------------------------------------------------------
describe('Ed25519 verification-profile corpus: runtime observations', () => {
  const vector = (id: string): Vector => {
    const found = corpus.vectors.find((x) => x.id === id);
    expect(found, `corpus vector ${id}`).toBeDefined();
    return found!;
  };

  const environmentsFor = (implementation: string): [string, Environment][] =>
    Object.entries(evidence.environments).filter(([, e]) => e.implementation === implementation);

  /** Recorded outcomes for one implementation, keyed by version. */
  const outcomes = (id: string, implementation: string): Map<string, string> => {
    const envs = environmentsFor(implementation);
    expect(envs.length, `environments for ${implementation}`).toBeGreaterThan(0);
    const result = new Map<string, string>();
    for (const [environmentId, environment] of envs) {
      const row = evidence.observations.find(
        (o) => o.vector_id === id && o.environment_id === environmentId
      );
      expect(row, `${id}: observation in ${environmentId}`).toBeDefined();
      result.set(environment.version, row!.outcome);
    }
    return result;
  };

  const every = (id: string, implementation: string, expected: string): void => {
    for (const [version, outcome] of outcomes(id, implementation)) {
      expect(outcome, `${id}: ${implementation}@${version}`).toBe(expected);
    }
  };

  it('is an informative artifact for this corpus', () => {
    expect(evidence.family).toBe(corpus.family);
    expect(evidence.status).toBe('Informative');
    expect(corpus.status).toBe('Normative');
    expect(evidence.observed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('carries no runtime measurement inside the normative corpus', () => {
    for (const v of corpus.vectors) {
      expect(v, v.id).not.toHaveProperty('empirical');
      expect(v, v.id).not.toHaveProperty('empirical_observations');
    }
  });

  it('every observation resolves to a described environment, exactly once', () => {
    const seen = new Set<string>();
    for (const o of evidence.observations) {
      expect(['accept', 'reject', 'unsupported'], o.vector_id).toContain(o.outcome);
      expect(
        corpus.vectors.some((v) => v.id === o.vector_id),
        `unknown vector ${o.vector_id}`
      ).toBe(true);
      const environment = evidence.environments[o.environment_id];
      expect(environment, `undefined environment ${o.environment_id}`).toBeDefined();
      expect(environment.harness_sha256, o.environment_id).toMatch(/^[0-9a-f]{64}$/);
      const identity = `${o.vector_id} ${o.environment_id}`;
      expect(seen.has(identity), `duplicate observation ${identity}`).toBe(false);
      seen.add(identity);
    }
    expect(evidence.observations.length).toBe(
      corpus.vectors.length * Object.keys(evidence.environments).length
    );
  });

  it('cofactored-only vectors 4 and 5: noble strict accepts, cofactorless rejects', () => {
    for (const id of ['speccheck-4', 'speccheck-5']) {
      every(id, 'noble:strict', 'accept');
      every(id, 'node:crypto', 'reject');
      every(id, 'go:crypto/ed25519', 'reject');
      expect(vector(id).peac_expected.accepted, `${id}: PEAC rejects`).toBe(false);
    }
  });

  it('small-order vectors 0, 1, 2 and 11 decide differently across Node versions', () => {
    for (const id of ['speccheck-0', 'speccheck-1', 'speccheck-2', 'speccheck-11']) {
      for (const implementation of ['node:webcrypto', 'node:crypto']) {
        const values = new Set(outcomes(id, implementation).values());
        expect(values.size, `${id}: ${implementation} is version-dependent`).toBeGreaterThan(1);
      }
      expect(vector(id).peac_expected.accepted, `${id}: PEAC rejects on every version`).toBe(false);
    }
  });

  it('canonical positives are accepted by every measured non-browser implementation', () => {
    for (const id of ['rfc8032-vector-1', 'peac-sign-positive']) {
      for (const implementation of [
        'noble:zip215',
        'noble:strict',
        'node:crypto',
        'node:webcrypto',
        'go:crypto/ed25519',
      ]) {
        every(id, implementation, 'accept');
      }
      expect(vector(id).peac_expected.accepted, `${id}: PEAC accepts`).toBe(true);
    }
  });

  it('records the WebKit zero-length-message divergence rather than hiding it', () => {
    // WebKit does not verify an Ed25519 signature over an empty message, including one it has just
    // produced. rfc8032-vector-1 signs an empty message. Tracked separately from this profile.
    every('rfc8032-vector-1', 'webkit:webcrypto', 'reject');
    every('rfc8032-vector-1', 'webkit:peac-wrapper', 'reject');
    every('rfc8032-vector-1', 'chromium:webcrypto', 'accept');
    every('rfc8032-vector-1', 'firefox:webcrypto', 'accept');
    every('peac-sign-positive', 'webkit:webcrypto', 'accept');
  });

  it('the PEAC wrapper matches peac_expected in every browser except that divergence', () => {
    for (const [environmentId, environment] of Object.entries(evidence.environments)) {
      if (environment.surface !== 'peac-wrapper') continue;
      for (const v of corpus.vectors) {
        if (v.id === 'rfc8032-vector-1' && environment.implementation.startsWith('webkit'))
          continue;
        const row = evidence.observations.find(
          (o) => o.vector_id === v.id && o.environment_id === environmentId
        );
        expect(row, `${v.id} in ${environmentId}`).toBeDefined();
        expect(row!.outcome, `${v.id}: ${environmentId}`).toBe(
          v.peac_expected.accepted ? 'accept' : 'reject'
        );
      }
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
    // Both tables must be applied to the R position, not to the public key alone.
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
