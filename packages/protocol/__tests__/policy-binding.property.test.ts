/**
 * Property-based tests for policy binding (DD-49, DD-151, DD-158)
 *
 * Uses fast-check to verify invariants:
 * 1. JCS determinism: same object with different key order produces same digest
 * 2. 3-state invariant: checkPolicyBinding always returns exactly one state
 * 3. verifyPolicyBinding symmetry: match iff equal
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { verifyPolicyBinding } from '@peac/schema';
import { computePolicyDigestJcs, checkPolicyBinding } from '../src/policy-binding';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a simple JSON object for JCS testing */
const jsonPrimitive = fc.oneof(
  fc.string({ maxLength: 50 }),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({
    noNaN: true,
    noDefaultInfinity: true,
    min: -1e6,
    max: 1e6,
  }),
  fc.boolean(),
  fc.constant(null)
);

const simpleJsonObject = fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/), jsonPrimitive, {
  minKeys: 1,
  maxKeys: 10,
});

/** Nested JSON objects for deeper JCS determinism testing */
const nestedJsonObject = fc
  .record({
    outer_key: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
    inner: simpleJsonObject,
    array_field: fc.array(jsonPrimitive, { minLength: 0, maxLength: 5 }),
    nested_obj: fc.dictionary(
      fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/),
      fc.oneof(jsonPrimitive, simpleJsonObject),
      { minKeys: 0, maxKeys: 3 }
    ),
  })
  .map(({ outer_key, inner, array_field, nested_obj }) => ({
    [outer_key]: inner,
    items: array_field,
    ...nested_obj,
  }));

/** Generate a sha256 digest string */
const sha256Digest = fc.stringMatching(/^[0-9a-f]{64}$/).map((hex) => `sha256:${hex}`);

/** Generate optional digest (undefined or sha256 string) */
const optionalDigest = fc.oneof(fc.constant(undefined), sha256Digest);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reorder keys in an object (deterministic) */
function reorderKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj);
  const reversed = [...keys].reverse();
  const result: Record<string, unknown> = {};
  for (const k of reversed) {
    result[k] = obj[k];
  }
  return result;
}

/** Rotate keys: move first key to end */
function rotateKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj);
  if (keys.length < 2) return { ...obj };
  const result: Record<string, unknown> = {};
  for (let i = 1; i < keys.length; i++) {
    result[keys[i]] = obj[keys[i]];
  }
  result[keys[0]] = obj[keys[0]];
  return result;
}

// ---------------------------------------------------------------------------
// Property 1: JCS determinism
// ---------------------------------------------------------------------------

describe('Property: JCS policy digest determinism', () => {
  it('same object, reversed key order produces same digest', async () => {
    await fc.assert(
      fc.asyncProperty(simpleJsonObject, async (obj) => {
        const digest1 = await computePolicyDigestJcs(obj);
        const digest2 = await computePolicyDigestJcs(reorderKeys(obj));
        expect(digest1).toBe(digest2);
      }),
      { numRuns: 200 }
    );
  });

  it('same object, rotated key order produces same digest', async () => {
    await fc.assert(
      fc.asyncProperty(simpleJsonObject, async (obj) => {
        const digest1 = await computePolicyDigestJcs(obj);
        const digest2 = await computePolicyDigestJcs(rotateKeys(obj));
        expect(digest1).toBe(digest2);
      }),
      { numRuns: 200 }
    );
  });

  it('nested objects: key order invariance holds at depth', async () => {
    await fc.assert(
      fc.asyncProperty(nestedJsonObject, async (obj) => {
        const digest1 = await computePolicyDigestJcs(obj);
        const digest2 = await computePolicyDigestJcs(reorderKeys(obj));
        expect(digest1).toBe(digest2);
      }),
      { numRuns: 100 }
    );
  });

  it('digest is always in sha256:<64 hex> format', async () => {
    await fc.assert(
      fc.asyncProperty(simpleJsonObject, async (obj) => {
        const digest = await computePolicyDigestJcs(obj);
        expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      }),
      { numRuns: 200 }
    );
  });

  it('sampled uniqueness smoke test: distinct objects produce distinct digests', async () => {
    await fc.assert(
      fc.asyncProperty(
        simpleJsonObject,
        simpleJsonObject.filter((_) => true),
        async (a, b) => {
          if (JSON.stringify(a) === JSON.stringify(b)) return; // skip equal pairs
          const d1 = await computePolicyDigestJcs(a);
          const d2 = await computePolicyDigestJcs(b);
          expect(d1).not.toBe(d2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: 3-state invariant
// ---------------------------------------------------------------------------

describe('Property: checkPolicyBinding 3-state invariant', () => {
  it('always returns one of unavailable, verified, or failed', () => {
    fc.assert(
      fc.property(optionalDigest, optionalDigest, (receipt, local) => {
        const status = checkPolicyBinding(receipt, local);
        expect(['unavailable', 'verified', 'failed']).toContain(status);
      }),
      { numRuns: 1000 }
    );
  });

  it('undefined input always produces unavailable', () => {
    fc.assert(
      fc.property(optionalDigest, (digest) => {
        expect(checkPolicyBinding(undefined, digest)).toBe('unavailable');
        expect(checkPolicyBinding(digest, undefined)).toBe('unavailable');
      }),
      { numRuns: 500 }
    );
  });

  it('both defined and equal produces verified', () => {
    fc.assert(
      fc.property(sha256Digest, (digest) => {
        expect(checkPolicyBinding(digest, digest)).toBe('verified');
      }),
      { numRuns: 500 }
    );
  });

  it('both defined and unequal produces failed', () => {
    fc.assert(
      fc.property(
        sha256Digest,
        sha256Digest.filter((_) => true),
        (a, b) => {
          if (a !== b) {
            expect(checkPolicyBinding(a, b)).toBe('failed');
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: verifyPolicyBinding symmetry
// ---------------------------------------------------------------------------

describe('Property: verifyPolicyBinding symmetry', () => {
  it('match iff equal', () => {
    fc.assert(
      fc.property(sha256Digest, sha256Digest, (a, b) => {
        const result = verifyPolicyBinding(a, b);
        if (a === b) {
          expect(result).toBe('verified');
        } else {
          expect(result).toBe('failed');
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('is commutative', () => {
    fc.assert(
      fc.property(sha256Digest, sha256Digest, (a, b) => {
        expect(verifyPolicyBinding(a, b)).toBe(verifyPolicyBinding(b, a));
      }),
      { numRuns: 500 }
    );
  });

  it('is reflexive', () => {
    fc.assert(
      fc.property(sha256Digest, (d) => {
        expect(verifyPolicyBinding(d, d)).toBe('verified');
      }),
      { numRuns: 500 }
    );
  });
});
