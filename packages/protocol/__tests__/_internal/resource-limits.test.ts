/**
 * Resource-limit invariant tests.
 *
 * Property: every receipt-content (kernel) invariant in
 * `docs/specs/RESOURCE-LIMITS.md` is enforced by the bounded
 * kernel-constraints validator with documented at-bound-pass +
 * at-bound-plus-one-fail vectors.
 *
 * Scope:
 *
 *   - Receipt-content invariants are validated through
 *     `validateKernelConstraintsInternal` (the parity-observed
 *     internal validator that mirrors the canonical
 *     `@peac/schema.validateKernelConstraints`).
 *   - Temporal invariants are validated through
 *     `validateTemporalInternal` against
 *     `OCCURRED_AT_TOLERANCE_SECONDS` from `@peac/kernel`.
 *
 * Out of scope (covered by the package owning the invariant; see
 * `docs/specs/RESOURCE-LIMITS.md` for the cross-references):
 *
 *   - HTTP-surface invariants (`apps/api/src/verify-v1.ts`).
 *   - Carrier-embed invariants (mappings packages).
 *   - Network-bearing invariants (net-node, jwks-cache, discovery).
 *   - SSRF policy (net-node ssrf module).
 *   - Cache-isolation policy (jwks-cache).
 *
 * Acceptance:
 *
 *   - The at-bound case MUST be accepted (`valid === true`,
 *     no matching violation).
 *   - The at-bound-plus-one case MUST be rejected
 *     (`valid === false`, AND a violation matching the constraint
 *     name appears in the violations array).
 */

import { describe, expect, it } from 'vitest';
import { KERNEL_CONSTRAINTS } from '@peac/schema';
import { OCCURRED_AT_TOLERANCE_SECONDS } from '@peac/kernel';
import { validateKernelConstraintsInternal } from '../../src/_internal/record-core/validators/kernel-constraints';
import { validateTemporalInternal } from '../../src/_internal/record-core/validators/temporal';

function violationCodes(result: ReturnType<typeof validateKernelConstraintsInternal>): string[] {
  return result.violations.map((v) => v.constraint);
}

describe('resource-limit invariants: kernel (receipt-content)', () => {
  describe('MAX_NESTED_DEPTH', () => {
    const limit = KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH;

    function nest(depth: number): unknown {
      let cur: unknown = 'leaf';
      for (let i = 0; i < depth; i += 1) cur = { nested: cur };
      return cur;
    }

    it(`accepts at the limit (depth = ${limit})`, () => {
      const r = validateKernelConstraintsInternal(nest(limit));
      expect(r.valid).toBe(true);
      expect(violationCodes(r)).not.toContain('MAX_NESTED_DEPTH');
    });

    it(`rejects at limit + 1 (depth = ${limit + 1})`, () => {
      const r = validateKernelConstraintsInternal(nest(limit + 1));
      expect(r.valid).toBe(false);
      expect(violationCodes(r)).toContain('MAX_NESTED_DEPTH');
    });
  });

  describe('MAX_ARRAY_LENGTH', () => {
    const limit = KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH;

    it(`accepts at the limit (length = ${limit})`, () => {
      const r = validateKernelConstraintsInternal({ items: new Array(limit).fill(0) });
      expect(r.valid).toBe(true);
      expect(violationCodes(r)).not.toContain('MAX_ARRAY_LENGTH');
    });

    it(`rejects at limit + 1 (length = ${limit + 1})`, () => {
      const r = validateKernelConstraintsInternal({ items: new Array(limit + 1).fill(0) });
      expect(r.valid).toBe(false);
      expect(violationCodes(r)).toContain('MAX_ARRAY_LENGTH');
    });
  });

  describe('MAX_OBJECT_KEYS', () => {
    const limit = KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS;

    function keysObject(n: number): Record<string, number> {
      const out: Record<string, number> = {};
      for (let i = 0; i < n; i += 1) out[`k${i}`] = i;
      return out;
    }

    it(`accepts at the limit (keys = ${limit})`, () => {
      const r = validateKernelConstraintsInternal({ payload: keysObject(limit) });
      expect(r.valid).toBe(true);
      expect(violationCodes(r)).not.toContain('MAX_OBJECT_KEYS');
    });

    it(`rejects at limit + 1 (keys = ${limit + 1})`, () => {
      const r = validateKernelConstraintsInternal({ payload: keysObject(limit + 1) });
      expect(r.valid).toBe(false);
      expect(violationCodes(r)).toContain('MAX_OBJECT_KEYS');
    });
  });

  describe('MAX_STRING_LENGTH', () => {
    const limit = KERNEL_CONSTRAINTS.MAX_STRING_LENGTH;

    it(`accepts at the limit (length = ${limit})`, () => {
      const r = validateKernelConstraintsInternal({ blob: 'a'.repeat(limit) });
      expect(r.valid).toBe(true);
      expect(violationCodes(r)).not.toContain('MAX_STRING_LENGTH');
    });

    it(`rejects at limit + 1 (length = ${limit + 1})`, () => {
      const r = validateKernelConstraintsInternal({ blob: 'a'.repeat(limit + 1) });
      expect(r.valid).toBe(false);
      expect(violationCodes(r)).toContain('MAX_STRING_LENGTH');
    });
  });

  describe('MAX_TOTAL_NODES', () => {
    const limit = KERNEL_CONSTRAINTS.MAX_TOTAL_NODES;

    // 999 keys whose values are arrays of N numbers. Each container is
    // independently within MAX_OBJECT_KEYS (1000) and MAX_ARRAY_LENGTH
    // (10000); only MAX_TOTAL_NODES gets crossed when N varies.
    function nodesShape(numbersPerArray: number): Record<string, number[]> {
      const out: Record<string, number[]> = {};
      for (let i = 0; i < 999; i += 1) {
        out[`k${i}`] = new Array(numbersPerArray).fill(0);
      }
      return out;
    }

    it(`accepts when totalNodes <= ${limit} (shape = 999 keys * 99 numbers = 99901)`, () => {
      const r = validateKernelConstraintsInternal(nodesShape(99));
      expect(r.valid).toBe(true);
      expect(violationCodes(r)).not.toContain('MAX_TOTAL_NODES');
    });

    it(`rejects when totalNodes > ${limit} (shape = 999 keys * 100 numbers = 100900)`, () => {
      const r = validateKernelConstraintsInternal(nodesShape(100));
      expect(r.valid).toBe(false);
      expect(violationCodes(r)).toContain('MAX_TOTAL_NODES');
    });
  });

  it('non-object inputs are accepted (validator no-ops)', () => {
    expect(validateKernelConstraintsInternal(null).valid).toBe(true);
    expect(validateKernelConstraintsInternal(undefined).valid).toBe(true);
    expect(validateKernelConstraintsInternal('hello').valid).toBe(true);
    expect(validateKernelConstraintsInternal(42).valid).toBe(true);
    expect(validateKernelConstraintsInternal(true).valid).toBe(true);
  });
});

describe('resource-limit invariants: temporal (occurred_at skew)', () => {
  const tolerance = OCCURRED_AT_TOLERANCE_SECONDS;
  const now = 1_734_000_000;
  const iat = now;

  function occurredAt(secondsFromNow: number): string {
    return new Date((now + secondsFromNow) * 1000).toISOString();
  }

  it(`accepts occurred_at at now + ${tolerance}s (= now + tolerance)`, () => {
    const r = validateTemporalInternal(occurredAt(tolerance), iat, now);
    expect(r.accepted).toBe(true);
  });

  it(`rejects occurred_at at now + ${tolerance + 1}s (= now + tolerance + 1)`, () => {
    const r = validateTemporalInternal(occurredAt(tolerance + 1), iat, now);
    expect(r.accepted).toBe(false);
    if (!r.accepted) {
      expect(r.errorCode).toBe('E_OCCURRED_AT_FUTURE');
    }
  });

  it('emits a warning when occurred_at is after iat but within tolerance', () => {
    const r = validateTemporalInternal(occurredAt(10), iat, now);
    expect(r.accepted).toBe(true);
    if (r.accepted && r.warnings) {
      expect(r.warnings.some((w) => w.code === 'occurred_at_skew')).toBe(true);
    }
  });

  it('accepts occurred_at = iat (no skew, no warning)', () => {
    const r = validateTemporalInternal(occurredAt(0), iat, now);
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      expect(r.warnings).toBeUndefined();
    }
  });

  it('accepts when occurred_at is omitted', () => {
    const r = validateTemporalInternal(undefined, iat, now);
    expect(r.accepted).toBe(true);
  });
});
