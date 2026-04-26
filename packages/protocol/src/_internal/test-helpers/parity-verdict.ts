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
