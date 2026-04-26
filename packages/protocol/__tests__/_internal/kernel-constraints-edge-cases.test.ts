/**
 * Edge-case parity tests for the bounded internal kernel-constraints
 * validator. The shared corpus may not hit every resource-limit
 * boundary; these tests pin the at-limit / one-over-limit behavior of
 * each constraint and assert RIGHT (internal) === LEFT (canonical).
 *
 * Constraints under test (KERNEL_CONSTRAINTS):
 *   - MAX_NESTED_DEPTH = 32
 *   - MAX_ARRAY_LENGTH = 10000
 *   - MAX_OBJECT_KEYS = 1000
 *   - MAX_STRING_LENGTH = 65536
 *   - MAX_TOTAL_NODES = 100000
 */

import { describe, it, expect } from 'vitest';
import { KERNEL_CONSTRAINTS, validateKernelConstraints } from '@peac/schema';
import { validateKernelConstraintsInternal } from '../../src/_internal/record-core/validators';

function bothAgree(input: unknown) {
  const left = validateKernelConstraints(input);
  const right = validateKernelConstraintsInternal(input);
  expect(right).toEqual(left);
  return left;
}

/** Build an object nested `depth` levels deep (root counts as depth 0). */
function nestObject(depth: number): unknown {
  let v: unknown = 'leaf';
  for (let i = 0; i < depth; i++) {
    v = { a: v };
  }
  return v;
}

describe('kernel-constraints edge cases (LEFT vs RIGHT)', () => {
  describe('primitive / null / undefined inputs', () => {
    it('null returns valid', () => {
      const r = bothAgree(null);
      expect(r.valid).toBe(true);
      expect(r.violations).toEqual([]);
    });

    it('undefined returns valid', () => {
      const r = bothAgree(undefined);
      expect(r.valid).toBe(true);
    });

    it('plain string returns valid', () => {
      const r = bothAgree('hello');
      expect(r.valid).toBe(true);
    });

    it('plain number returns valid', () => {
      const r = bothAgree(42);
      expect(r.valid).toBe(true);
    });

    it('plain boolean returns valid', () => {
      const r = bothAgree(true);
      expect(r.valid).toBe(true);
    });

    it('empty object returns valid', () => {
      const r = bothAgree({});
      expect(r.valid).toBe(true);
    });

    it('empty array returns valid', () => {
      const r = bothAgree([]);
      expect(r.valid).toBe(true);
    });
  });

  describe('MAX_NESTED_DEPTH (32)', () => {
    it('depth exactly at limit (32) is valid', () => {
      const r = bothAgree(nestObject(KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH));
      expect(r.valid).toBe(true);
    });

    it('depth one over limit (33) is a violation', () => {
      const r = bothAgree(nestObject(KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH + 1));
      expect(r.valid).toBe(false);
      expect(r.violations.some((v) => v.constraint === 'MAX_NESTED_DEPTH')).toBe(true);
    });
  });

  describe('MAX_ARRAY_LENGTH (10000)', () => {
    it('array length exactly at limit is valid', () => {
      const arr = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH).fill(0);
      const r = bothAgree({ a: arr });
      expect(r.valid).toBe(true);
    });

    it('array length one over limit is a violation', () => {
      const arr = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);
      const r = bothAgree({ a: arr });
      expect(r.valid).toBe(false);
      expect(r.violations.some((v) => v.constraint === 'MAX_ARRAY_LENGTH')).toBe(true);
    });
  });

  describe('MAX_OBJECT_KEYS (1000)', () => {
    function objWithKeys(n: number): Record<string, number> {
      const o: Record<string, number> = {};
      for (let i = 0; i < n; i++) o[`k${i}`] = i;
      return o;
    }

    it('object key count exactly at limit is valid', () => {
      const r = bothAgree(objWithKeys(KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS));
      expect(r.valid).toBe(true);
    });

    it('object key count one over limit is a violation', () => {
      const r = bothAgree(objWithKeys(KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS + 1));
      expect(r.valid).toBe(false);
      expect(r.violations.some((v) => v.constraint === 'MAX_OBJECT_KEYS')).toBe(true);
    });
  });

  describe('MAX_STRING_LENGTH (65536)', () => {
    it('string length exactly at limit is valid', () => {
      const s = 'a'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH);
      const r = bothAgree({ a: s });
      expect(r.valid).toBe(true);
    });

    it('string length one over limit is a violation', () => {
      const s = 'a'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const r = bothAgree({ a: s });
      expect(r.valid).toBe(false);
      expect(r.violations.some((v) => v.constraint === 'MAX_STRING_LENGTH')).toBe(true);
    });
  });

  describe('MAX_TOTAL_NODES (100000) and break behavior', () => {
    function arrOfLen(n: number): unknown[] {
      return new Array(n).fill(0);
    }

    function objWithNArrays(arrayCount: number, perArray: number): Record<string, unknown[]> {
      const o: Record<string, unknown[]> = {};
      for (let i = 0; i < arrayCount; i++) o[`a${i}`] = arrOfLen(perArray);
      return o;
    }

    it('total nodes well under the limit is valid (multi-array shape avoids array-length cap)', () => {
      // 10 arrays * 9000 leaves = 90000 + 11 containers = 90011 nodes.
      // Each individual array (9000) stays under MAX_ARRAY_LENGTH (10000).
      const r = bothAgree(objWithNArrays(10, 9000));
      expect(r.valid).toBe(true);
    });

    it('total nodes over the limit emits MAX_TOTAL_NODES and breaks (single violation)', () => {
      // 11 arrays * 9100 leaves = 100100 + 12 containers = 100112 nodes.
      // Each individual array (9100) stays under MAX_ARRAY_LENGTH (10000),
      // so the only over-limit constraint is MAX_TOTAL_NODES.
      const r = bothAgree(objWithNArrays(11, 9100));
      expect(r.valid).toBe(false);
      const totalNodeViolations = r.violations.filter((v) => v.constraint === 'MAX_TOTAL_NODES');
      // Break-on-overflow: exactly one MAX_TOTAL_NODES violation.
      expect(totalNodeViolations.length).toBe(1);
    });
  });

  describe('path formatting parity', () => {
    it('object keys use dot notation', () => {
      const s = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const r = bothAgree({ a: { b: { c: s } } });
      const v = r.violations.find((x) => x.constraint === 'MAX_STRING_LENGTH');
      expect(v?.path).toBe('a.b.c');
    });

    it('array indices use bracket notation', () => {
      const s = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const r = bothAgree({ a: [s] });
      const v = r.violations.find((x) => x.constraint === 'MAX_STRING_LENGTH');
      expect(v?.path).toBe('a[0]');
    });

    it('nested mixed array/object path', () => {
      const s = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const r = bothAgree({ a: [{ b: s }] });
      const v = r.violations.find((x) => x.constraint === 'MAX_STRING_LENGTH');
      expect(v?.path).toBe('a[0].b');
    });
  });

  describe('depth-violation behavior preserves no-descent semantics', () => {
    it('depth one over limit at a string leaf records a single MAX_NESTED_DEPTH violation, not a string-length violation', () => {
      // 33 levels deep terminating in a string under the string limit.
      // The depth check fires and `continue`s; string-length is not
      // re-checked because the depth-violating frame is skipped.
      const s = 'short';
      const v = nestObject(KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH + 1);
      // Replace the deepest leaf with `s` — but nestObject already uses 'leaf'.
      // Build: depth = 33 nested wrappers around a short string.
      let inner: unknown = s;
      for (let i = 0; i < KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH + 1; i++) {
        inner = { a: inner };
      }
      const r = bothAgree(inner);
      expect(r.valid).toBe(false);
      const depthViolations = r.violations.filter((x) => x.constraint === 'MAX_NESTED_DEPTH');
      expect(depthViolations.length).toBe(1);
      // Sanity-use of v to keep TS lint quiet.
      expect(v).toBeDefined();
    });
  });
});
