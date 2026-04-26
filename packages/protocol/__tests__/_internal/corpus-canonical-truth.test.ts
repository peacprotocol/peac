/**
 * Expected-vs-canonical sanity test for the parity corpus.
 *
 * For each of the floor vectors in specs/conformance/parity-corpus/,
 * runs the existing canonical validator path and asserts that the
 * vector's `expected` outcome matches reality. This is the truth-anchor
 * for the parity corpus: without it, the differential harness could
 * prove "zero divergence" while encoding false fixture expectations
 * (LEFT and RIGHT both wrong).
 *
 * Comparison is done by stable JSON of the normalized ParityVerdict
 * shape, never raw exception messages or Zod issue text.
 */

import { describe, it, expect } from 'vitest';
import {
  PARITY_FAMILIES,
  loadFamily,
  type ParityVector,
} from '../../src/_internal/test-helpers/corpus-loader';
import {
  runCanonicalForKind,
  type CanonicalRunnerKind,
} from '../../src/_internal/test-helpers/canonical-runner';
import { makeVerdict, verdictKeyShape } from '../../src/_internal/test-helpers/parity-verdict';

function expectedAsVerdict(vector: ParityVector) {
  return makeVerdict(
    vector.expected.accepted,
    (vector.expected.errors ?? []).map((e) => ({ code: e.code, path: e.path })),
    (vector.expected.warnings ?? []).map((w) => ({ code: w.code, path: w.path }))
  );
}

describe('parity-corpus expectations vs canonical truth', () => {
  for (const family of PARITY_FAMILIES) {
    const loaded = loadFamily(family);
    const kind: CanonicalRunnerKind = family === 'jose-hardening' ? 'jose' : 'envelope';
    describe(family, () => {
      for (const vector of loaded.vectors) {
        it(`${vector.id}: expected matches canonical`, async () => {
          const input =
            kind === 'jose'
              ? ((vector.input.header ?? {}) as Record<string, unknown>)
              : (vector.input.payload as Record<string, unknown>);
          const canonical = await runCanonicalForKind(kind, input);
          const expected = expectedAsVerdict(vector);
          // verdictKeyShape ignores canonicalClaimsDigest because the
          // corpus expectation only encodes accept/reject + error/warning
          // codes; digest verification is the differential harness's job.
          expect(verdictKeyShape(canonical)).toBe(verdictKeyShape(expected));
        });
      }
    });
  }
});
