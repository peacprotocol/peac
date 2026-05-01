/**
 * Parity verdict normalization + comparison helpers.
 *
 * INTERNAL TEST HELPER. Used by the parity corpus sanity test and by the
 * differential harness. Verdict comparison is done by stable JSON of the
 * normalized shape, never by raw exception messages or Zod issue text.
 */

import type { ParityError, ParityVerdict, ParityWarning } from '../record-core/validators/types.js';

export type { ParityError, ParityVerdict, ParityWarning };

function sortIssues<T extends { code: string; path?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ap = a.path ?? '';
    const bp = b.path ?? '';
    if (ap !== bp) return ap < bp ? -1 : 1;
    return 0;
  });
}

function dedupe<T extends { code: string; path?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = `${it.code} ${it.path ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Build a normalized ParityVerdict. Errors and warnings are sorted by
 * (code, path) and deduplicated. Optional canonicalClaimsDigest carries
 * through unchanged.
 */
export function makeVerdict(
  accepted: boolean,
  errors: ParityError[] = [],
  warnings: ParityWarning[] = [],
  canonicalClaimsDigest?: string
): ParityVerdict {
  const verdict: ParityVerdict = {
    accepted,
    errors: dedupe(sortIssues(errors)),
    warnings: dedupe(sortIssues(warnings)),
  };
  if (canonicalClaimsDigest !== undefined) {
    return { ...verdict, canonicalClaimsDigest };
  }
  return verdict;
}

function verdictBase(v: ParityVerdict): Record<string, unknown> {
  const errs = v.errors.map((e) =>
    e.path === undefined ? { code: e.code } : { code: e.code, path: e.path }
  );
  const warns = v.warnings.map((w) =>
    w.path === undefined ? { code: w.code } : { code: w.code, path: w.path }
  );
  return {
    accepted: v.accepted,
    errors: errs,
    warnings: warns,
  };
}

/**
 * Stringify a ParityVerdict for byte-equality comparison. Stable key
 * order: accepted, errors, warnings, canonicalClaimsDigest. Omits
 * undefined path / digest fields so absence and explicit-undefined are
 * equivalent. Use this when both sides under comparison are expected
 * to carry the same digest (e.g., the same-path differential proof).
 */
export function verdictKey(v: ParityVerdict): string {
  const obj = verdictBase(v);
  if (v.canonicalClaimsDigest !== undefined) {
    obj.canonicalClaimsDigest = v.canonicalClaimsDigest;
  }
  return JSON.stringify(obj);
}

/**
 * Stringify a ParityVerdict OMITTING canonicalClaimsDigest. Use this
 * when comparing a runtime verdict (which carries a digest for accepted
 * records) against a fixture-supplied expectation (which does not
 * encode digests). Example caller: corpus-canonical-truth sanity test.
 */
export function verdictKeyShape(v: ParityVerdict): string {
  return JSON.stringify(verdictBase(v));
}

/**
 * Stringify a ParityVerdict using error-class-equivalent semantics.
 *
 * Encodes ONLY:
 *   - `accepted` boolean
 *   - sorted error-code MULTISET preserving counts
 *
 * Ignores:
 *   - error path
 *   - warnings (codes and paths)
 *   - canonicalClaimsDigest
 *   - any other field
 *
 * Does NOT dedupe duplicate codes. Two errors emitted with the same
 * `code` are encoded as two entries; this preserves multiset semantics
 * because duplicate counts may carry meaningful diagnostic signal that
 * dedup would erase.
 *
 * Use for diagnostic overlap comparisons where the goal is to assert
 * agreement on what error CLASS was raised, independent of where it
 * was emitted, what message it carried, or what warnings accompanied
 * it. Path comparison is intentionally too strict for this gate;
 * callers needing path-aware comparison should use `verdictKey` or
 * `verdictKeyShape`.
 *
 * NOTE on input construction: `makeVerdict()` deduplicates errors by
 * `(code, path)` before normalization. To preserve a true multiset of
 * same-code entries through `verdictKeyErrorClass`, callers MUST
 * construct the `ParityVerdict` literally (without `makeVerdict`) or
 * supply errors with distinct `path` values that survive dedup. The
 * function operates on the verdict's `.errors` array as given; it is
 * the caller's responsibility to ensure that array carries the
 * intended multiset shape.
 */
export function verdictKeyErrorClass(v: ParityVerdict): string {
  const errorCodes = v.errors.map((e) => e.code);
  const sorted = [...errorCodes].sort();
  return JSON.stringify({
    accepted: v.accepted,
    errorCodes: sorted,
  });
}
