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

/**
 * Extension-level diagnostic codes use a dotted `<namespace>.<code>`
 * form (for example `provisioning.invalid_amount_minor`). Wire-envelope
 * canonical paths only emit non-dotted codes (kernel constraint codes
 * like `MAX_NESTED_DEPTH`; JOSE-hardening codes prefixed with
 * `CRYPTO_`). A parity-corpus family that documents extension-level
 * expectations alongside envelope-level acceptance must register its
 * dotted prefixes here so the canonical-truth comparison can filter
 * those codes out without losing track of unregistered dotted codes
 * elsewhere.
 *
 * The map is family-scoped on purpose: a global "all dotted codes are
 * extension-level" filter would silently swallow accidental dotted
 * codes in other families. Adding a family + prefix here is a
 * conscious decision; unregistered dotted codes throw a hard error
 * that surfaces during the canonical-truth test run.
 */
const EXTENSION_ERROR_PREFIXES_BY_FAMILY: Readonly<Record<string, readonly string[]>> = {
  'provisioning-lifecycle': ['provisioning.'],
};

function isEnvelopeLevelCode(family: string, code: string): boolean {
  const extensionPrefixes = EXTENSION_ERROR_PREFIXES_BY_FAMILY[family] ?? [];
  if (extensionPrefixes.some((prefix) => code.startsWith(prefix))) {
    return false;
  }
  if (code.includes('.')) {
    throw new Error(
      `parity-corpus(${family}): dotted diagnostic code ${code} is not registered as an extension-level expectation. Register the dotted prefix in EXTENSION_ERROR_PREFIXES_BY_FAMILY in this test, or correct the corpus.`
    );
  }
  return true;
}

function expectedAsVerdict(family: string, vector: ParityVector) {
  return makeVerdict(
    vector.expected.accepted,
    (vector.expected.errors ?? [])
      .filter((e) => isEnvelopeLevelCode(family, e.code))
      .map((e) => ({ code: e.code, path: e.path })),
    (vector.expected.warnings ?? [])
      .filter((w) => isEnvelopeLevelCode(family, w.code))
      .map((w) => ({ code: w.code, path: w.path }))
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
          const expected = expectedAsVerdict(family, vector);
          // verdictKeyShape ignores canonicalClaimsDigest because the
          // corpus expectation only encodes accept/reject + error/warning
          // codes; digest verification is the differential harness's job.
          expect(verdictKeyShape(canonical)).toBe(verdictKeyShape(expected));
        });
      }
    });
  }
});

describe('parity-corpus extension-level prefix registration', () => {
  it('rejects unregistered dotted diagnostic codes (negative guard for the family-scoped filter)', () => {
    expect(() =>
      isEnvelopeLevelCode('provisioning-lifecycle', 'provisioning.invalid_currency')
    ).not.toThrow();
    expect(() => isEnvelopeLevelCode('default-flows', 'provisioning.invalid_currency')).toThrow(
      /not registered as an extension-level expectation/
    );
    expect(() => isEnvelopeLevelCode('default-flows', 'lifecycle.foo')).toThrow(
      /not registered as an extension-level expectation/
    );
    // Non-dotted codes pass for any family (kernel + JOSE codes).
    expect(isEnvelopeLevelCode('default-flows', 'MAX_NESTED_DEPTH')).toBe(true);
    expect(isEnvelopeLevelCode('jose-hardening', 'CRYPTO_JWS_EMBEDDED_KEY')).toBe(true);
  });
});
