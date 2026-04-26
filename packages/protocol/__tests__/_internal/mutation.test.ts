/**
 * Mutation oracle suite for the verifier hot path.
 *
 * Property: every byte-level mutation of a valid Wire 0.2 JWS is
 * rejected by `verifyLocal` with a structured `E_*` error code. The
 * verifier MUST NOT accept a mutated record, MUST NOT silently
 * downgrade to an alternate verdict, and MUST NOT throw an unstructured
 * exception that escapes the public-call boundary.
 *
 * Sampling shape (deterministic):
 *
 *   For each fixture (here a freshly issued happy-path JWS), the
 *   suite produces a fixed seeded sequence of 100 mutated copies
 *   covering the four byte-level mutation classes from the plan:
 *
 *     - flip: replace one byte with a different ASCII byte at a
 *       seeded offset within the JWS string.
 *     - separator-removal: remove one of the two `.` separators.
 *     - trailing-append: append a single ASCII byte to the end.
 *     - prefix-insert: insert a single ASCII byte at position 0.
 *
 *   The seeded RNG (mulberry32) makes the sample reproducible across
 *   runs and platforms. CI flakiness on this suite would indicate a
 *   real verifier nondeterminism, not test noise.
 *
 * Acceptance:
 *
 *   - For every mutation, verifyLocal MUST return a result with
 *     `valid === false` and a `code` matching the registered E_*
 *     grammar (`/^E_[A-Z0-9_]+$/`).
 *   - Plain-throw is also acceptable IF the thrown value is a
 *     structured CryptoError-like object whose code matches the
 *     same grammar; the suite catches and asserts in that path.
 *   - `valid === true` for any mutated input is a hard failure.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import { issueWire02, verifyLocal } from '../../src/index';

const SAMPLES_PER_FIXTURE = 100;
const SEED = 0xc0ffee;
const ERROR_CODE_GRAMMAR = /^E_[A-Z0-9_]+$/;

const testKid = '2026-01-15T10:30:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/payment';
const testExtensions = {
  'org.peacprotocol/commerce': {
    payment_rail: 'stripe',
    amount_minor: '1000',
    currency: 'USD',
  },
};

/**
 * Mulberry32 PRNG. Tiny, fast, and deterministic. Public-domain.
 * Returns a uint32 each call.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) >>> 0;
  };
}

type MutationKind = 'flip' | 'separator-removal' | 'trailing-append' | 'prefix-insert';

interface Mutation {
  readonly kind: MutationKind;
  readonly mutated: string;
  readonly description: string;
}

function mutateByteFlip(jws: string, rand: () => number): Mutation {
  if (jws.length === 0) {
    return { kind: 'flip', mutated: 'X', description: 'flip on empty input' };
  }
  const idx = rand() % jws.length;
  const original = jws.charCodeAt(idx);
  // Pick a different printable ASCII byte. JWS uses base64url + '.', so
  // any letter / digit substitution may collide; use a deliberately
  // out-of-class byte (printable, non-base64url, non-dot).
  const replacement = original === 0x2a /* '*' */ ? 0x40 : 0x2a; // '*' or '@'
  const mutated = jws.slice(0, idx) + String.fromCharCode(replacement) + jws.slice(idx + 1);
  return {
    kind: 'flip',
    mutated,
    description: `flip @ ${idx} (0x${original.toString(16)} -> 0x${replacement.toString(16)})`,
  };
}

function mutateSeparatorRemoval(jws: string, rand: () => number): Mutation {
  const dotPositions: number[] = [];
  for (let i = 0; i < jws.length; i += 1) if (jws.charCodeAt(i) === 0x2e) dotPositions.push(i);
  if (dotPositions.length === 0) {
    return { kind: 'separator-removal', mutated: jws + '.', description: 'no dots to remove' };
  }
  const idx = dotPositions[rand() % dotPositions.length];
  const mutated = jws.slice(0, idx) + jws.slice(idx + 1);
  return { kind: 'separator-removal', mutated, description: `remove dot @ ${idx}` };
}

function mutateTrailingAppend(jws: string, _rand: () => number): Mutation {
  return {
    kind: 'trailing-append',
    mutated: jws + 'A',
    description: 'append single ASCII byte at end',
  };
}

function mutatePrefixInsert(jws: string, _rand: () => number): Mutation {
  return {
    kind: 'prefix-insert',
    mutated: 'A' + jws,
    description: 'insert single ASCII byte at position 0',
  };
}

function makeMutationSequence(jws: string, count: number, seed: number): Mutation[] {
  const rand = mulberry32(seed);
  const out: Mutation[] = [];
  // Distribute over four classes proportionally; flip dominates because
  // the byte-position search space is the largest.
  const classDistribution: ((j: string, r: () => number) => Mutation)[] = [
    mutateByteFlip,
    mutateByteFlip,
    mutateByteFlip,
    mutateByteFlip,
    mutateSeparatorRemoval,
    mutateTrailingAppend,
    mutatePrefixInsert,
  ];
  for (let i = 0; i < count; i += 1) {
    const fn = classDistribution[i % classDistribution.length];
    out.push(fn(jws, rand));
  }
  return out;
}

async function expectStructuredRejection(jws: string, publicKey: Uint8Array): Promise<void> {
  let result: Awaited<ReturnType<typeof verifyLocal>>;
  let thrown: unknown;
  try {
    result = await verifyLocal(jws, publicKey);
  } catch (err) {
    thrown = err;
    result = undefined as never;
  }

  if (thrown !== undefined) {
    // Structured throw is acceptable iff it carries a registered code.
    const obj = thrown as { code?: unknown };
    expect(typeof obj.code).toBe('string');
    expect(obj.code as string).toMatch(ERROR_CODE_GRAMMAR);
    return;
  }

  expect(result).toBeDefined();
  expect(result.valid).toBe(false);
  if (!result.valid) {
    expect(result.code).toMatch(ERROR_CODE_GRAMMAR);
  }
}

describe('mutation oracle: every byte mutation rejected with structured error', () => {
  it('rejects 100 deterministic mutations of a happy-path Wire 0.2 JWS', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws: cleanJws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });

    // Sanity: clean JWS verifies before we mutate it.
    const clean = await verifyLocal(cleanJws, publicKey);
    expect(clean.valid).toBe(true);

    const mutations = makeMutationSequence(cleanJws, SAMPLES_PER_FIXTURE, SEED);
    expect(mutations).toHaveLength(SAMPLES_PER_FIXTURE);

    let acceptedCount = 0;
    for (const m of mutations) {
      // Skip the rare case where the mutation accidentally produced
      // the original input (extremely unlikely with the chosen byte
      // substitutions). Recheck conservatively.
      if (m.mutated === cleanJws) continue;

      let mutatedAccepted = false;
      try {
        const r = await verifyLocal(m.mutated, publicKey);
        if (r.valid) {
          mutatedAccepted = true;
        } else {
          expect(r.code).toMatch(ERROR_CODE_GRAMMAR);
        }
      } catch (err) {
        const obj = err as { code?: unknown };
        expect(typeof obj.code).toBe('string');
        expect(obj.code as string).toMatch(ERROR_CODE_GRAMMAR);
      }

      if (mutatedAccepted) {
        acceptedCount += 1;
        // Surface the failing mutation so a regression is debuggable.
        // eslint-disable-next-line no-console
        console.error(`mutation accepted unexpectedly: ${m.kind} ${m.description}`);
      }
    }

    expect(acceptedCount).toBe(0);
  });

  it('separator removal alone always rejects', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });
    const dotIndices: number[] = [];
    for (let i = 0; i < jws.length; i += 1) if (jws.charCodeAt(i) === 0x2e) dotIndices.push(i);
    expect(dotIndices.length).toBe(2);
    for (const idx of dotIndices) {
      const mutated = jws.slice(0, idx) + jws.slice(idx + 1);
      await expectStructuredRejection(mutated, publicKey);
    }
  });

  it('extra trailing dot always rejects', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });
    await expectStructuredRejection(jws + '.', publicKey);
  });

  it('empty input rejects with a structured code', async () => {
    const { publicKey } = await generateKeypair();
    await expectStructuredRejection('', publicKey);
  });

  it('garbage non-JWS string rejects with a structured code', async () => {
    const { publicKey } = await generateKeypair();
    await expectStructuredRejection('not.a.jws', publicKey);
  });
});
