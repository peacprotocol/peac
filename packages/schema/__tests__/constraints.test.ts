/**
 * Unit tests for kernel constraints (DD-60)
 *
 * Tests the KERNEL_CONSTRAINTS constants and validateKernelConstraints()
 * function that provides iterative, stack-safe structural validation.
 */

import { describe, it, expect } from 'vitest';
import { KERNEL_CONSTRAINTS, validateKernelConstraints } from '../src/constraints';
import type {
  KernelConstraintKey,
  ConstraintViolation,
  ConstraintValidationResult,
} from '../src/constraints';
import { JSON_EVIDENCE_LIMITS, assertJsonSafeIterative } from '../src/json';

// ---------------------------------------------------------------------------
// KERNEL_CONSTRAINTS constant values
// ---------------------------------------------------------------------------

describe('KERNEL_CONSTRAINTS', () => {
  it('exports all expected constraint keys', () => {
    const expected: KernelConstraintKey[] = [
      'MAX_NESTED_DEPTH',
      'MAX_ARRAY_LENGTH',
      'MAX_OBJECT_KEYS',
      'MAX_STRING_LENGTH',
      'MAX_TOTAL_NODES',
      'CLOCK_SKEW_SECONDS',
    ];
    for (const key of expected) {
      expect(KERNEL_CONSTRAINTS).toHaveProperty(key);
      expect(typeof KERNEL_CONSTRAINTS[key]).toBe('number');
    }
  });

  it('has exactly the provenance-backed keys (no payment/rail limits)', () => {
    const keys = Object.keys(KERNEL_CONSTRAINTS);
    expect(keys).toHaveLength(6);
    // Payment limits (MAX_SPLITS, MAX_FIELD_SIZE_BYTES, etc.) must NOT be here
    expect(keys).not.toContain('MAX_SPLITS');
    expect(keys).not.toContain('MAX_FIELD_SIZE_BYTES');
    expect(keys).not.toContain('MAX_ENTRY_SIZE_BYTES');
    expect(keys).not.toContain('MAX_PAYLOAD_SIZE_BYTES');
  });

  it('has immutable values (as const)', () => {
    expect(KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH).toBe(32);
    expect(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH).toBe(10_000);
    expect(KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS).toBe(1_000);
    expect(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH).toBe(65_536);
    expect(KERNEL_CONSTRAINTS.MAX_TOTAL_NODES).toBe(100_000);
    expect(KERNEL_CONSTRAINTS.CLOCK_SKEW_SECONDS).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// JSON_EVIDENCE_LIMITS derivation
// ---------------------------------------------------------------------------

describe('JSON_EVIDENCE_LIMITS derivation', () => {
  it('derives maxDepth from KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH', () => {
    expect(JSON_EVIDENCE_LIMITS.maxDepth).toBe(KERNEL_CONSTRAINTS.MAX_NESTED_DEPTH);
  });

  it('derives maxArrayLength from KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH', () => {
    expect(JSON_EVIDENCE_LIMITS.maxArrayLength).toBe(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH);
  });

  it('derives maxObjectKeys from KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS', () => {
    expect(JSON_EVIDENCE_LIMITS.maxObjectKeys).toBe(KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS);
  });

  it('derives maxStringLength from KERNEL_CONSTRAINTS.MAX_STRING_LENGTH', () => {
    expect(JSON_EVIDENCE_LIMITS.maxStringLength).toBe(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH);
  });

  it('derives maxTotalNodes from KERNEL_CONSTRAINTS.MAX_TOTAL_NODES', () => {
    expect(JSON_EVIDENCE_LIMITS.maxTotalNodes).toBe(KERNEL_CONSTRAINTS.MAX_TOTAL_NODES);
  });
});

// ---------------------------------------------------------------------------
// validateKernelConstraints() -- basic behavior
// ---------------------------------------------------------------------------

describe('validateKernelConstraints', () => {
  describe('non-object inputs', () => {
    it('returns valid for null', () => {
      const result = validateKernelConstraints(null);
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns valid for undefined', () => {
      const result = validateKernelConstraints(undefined);
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns valid for primitives', () => {
      for (const val of ['string', 42, true, false]) {
        const result = validateKernelConstraints(val);
        expect(result.valid).toBe(true);
        expect(result.violations).toEqual([]);
      }
    });
  });

  describe('valid objects', () => {
    it('returns valid for empty object', () => {
      const result = validateKernelConstraints({});
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns valid for typical receipt claims', () => {
      const claims = {
        iss: 'https://issuer.example.com',
        sub: 'https://resource.example.com',
        iat: 1700000000,
        rid: 'receipt-001',
        auth: { method: 'oauth2', verified: true },
        evidence: { type: 'payment', amount: 100 },
      };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns valid for nested object within limits', () => {
      const claims: Record<string, unknown> = { a: { b: { c: { d: 'deep' } } } };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(true);
    });

    it('returns valid for arrays within limits', () => {
      const claims = { items: [1, 2, 3, 'a', 'b'] };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(true);
    });
  });

  describe('depth violation', () => {
    it('detects depth exceeding MAX_NESTED_DEPTH', () => {
      // Build object nested to depth 33 (violates MAX_NESTED_DEPTH=32)
      let obj: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 33; i++) {
        obj = { nested: obj };
      }
      const result = validateKernelConstraints(obj);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_NESTED_DEPTH')).toBe(true);
    });

    it('accepts depth exactly at MAX_NESTED_DEPTH', () => {
      // Build object nested to depth 32 (exactly at limit)
      let obj: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 31; i++) {
        obj = { nested: obj };
      }
      const result = validateKernelConstraints(obj);
      expect(result.valid).toBe(true);
    });
  });

  describe('array length violation', () => {
    it('detects arrays exceeding MAX_ARRAY_LENGTH', () => {
      const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);
      const claims = { data: bigArray };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_ARRAY_LENGTH')).toBe(true);
    });
  });

  describe('object keys violation', () => {
    it('detects objects exceeding MAX_OBJECT_KEYS', () => {
      const bigObj: Record<string, number> = {};
      for (let i = 0; i <= KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS; i++) {
        bigObj[`key${i}`] = i;
      }
      const claims = { data: bigObj };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_OBJECT_KEYS')).toBe(true);
    });
  });

  describe('string length violation', () => {
    it('detects strings exceeding MAX_STRING_LENGTH', () => {
      const bigString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const claims = { data: bigString };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_STRING_LENGTH')).toBe(true);
    });

    it('measures code units, not bytes (multi-byte chars)', () => {
      // '\u{1F600}' is 2 code units (surrogate pair) but 4 UTF-8 bytes.
      // With .length semantics, we need > 65536 code units to violate.
      // 32769 emojis = 65538 code units (each emoji = 2 code units)
      const emojiCount = Math.ceil(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH / 2) + 1;
      const bigString = '\u{1F600}'.repeat(emojiCount);
      expect(bigString.length).toBeGreaterThan(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH);
      const claims = { data: bigString };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_STRING_LENGTH')).toBe(true);
    });
  });

  describe('total nodes violation', () => {
    it('detects structures exceeding MAX_TOTAL_NODES', () => {
      // Create a wide, shallow structure with many nodes
      const claims: Record<string, unknown> = {};
      const arrSize = 10_000;
      for (let i = 0; i < 11; i++) {
        claims[`arr${i}`] = new Array(arrSize).fill(i);
      }
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === 'MAX_TOTAL_NODES')).toBe(true);
    });
  });

  describe('multiple violations', () => {
    it('reports string length violations across branches', () => {
      const bigString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const claims = { a: bigString, b: bigString };
      const result = validateKernelConstraints(claims);
      expect(result.valid).toBe(false);
      const stringViolations = result.violations.filter(
        (v) => v.constraint === 'MAX_STRING_LENGTH'
      );
      expect(stringViolations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('never throws', () => {
    it('handles circular references gracefully', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      // Stack-based traversal will revisit the same object, eventually
      // hitting MAX_TOTAL_NODES. Should never throw.
      const result = validateKernelConstraints(obj);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    });

    it('handles non-serializable values', () => {
      const claims = { fn: () => {}, sym: Symbol('test') };
      const result = validateKernelConstraints(claims);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('violation structure', () => {
    it('includes constraint name, actual value, and limit', () => {
      const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 5).fill(0);
      const claims = { data: bigArray };
      const result = validateKernelConstraints(claims);
      const violation = result.violations.find((v) => v.constraint === 'MAX_ARRAY_LENGTH');
      expect(violation).toBeDefined();
      expect(violation!.actual).toBe(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 5);
      expect(violation!.limit).toBe(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH);
    });

    it('includes path for nested violations', () => {
      const bigArray = new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0);
      const claims = { outer: { inner: bigArray } };
      const result = validateKernelConstraints(claims);
      const violation = result.violations.find((v) => v.constraint === 'MAX_ARRAY_LENGTH');
      expect(violation).toBeDefined();
      expect(violation!.path).toBe('outer.inner');
    });
  });

  describe('result type contract', () => {
    it('valid result has empty violations array', () => {
      const result = validateKernelConstraints({ ok: true });
      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('invalid result has non-empty violations array', () => {
      const bigString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
      const result = validateKernelConstraints({ data: bigString });
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Equivalence lock: assertJsonSafeIterative vs validateKernelConstraints
// ---------------------------------------------------------------------------

describe('equivalence: assertJsonSafeIterative vs validateKernelConstraints', () => {
  // For JSON-safe structures (no cycles, all plain objects, all JSON types),
  // both validators must agree on accept/reject for structural limits.
  // assertJsonSafeIterative returns early on first violation; validateKernelConstraints
  // collects all. The equivalence is: both accept or both reject.

  const validInputs: Array<{ label: string; value: unknown }> = [
    { label: 'empty object', value: {} },
    { label: 'flat object', value: { a: 1, b: 'two', c: true, d: null } },
    { label: 'nested object', value: { a: { b: { c: { d: 1 } } } } },
    { label: 'array of primitives', value: { arr: [1, 2, 3, 'four', true, null] } },
    { label: 'depth 31 (within limit)', value: buildNestedObject(31) },
    { label: 'array at 9999 (within limit)', value: { arr: new Array(9999).fill(0) } },
    {
      label: 'object at 999 keys (within limit)',
      value: Object.fromEntries(Array.from({ length: 999 }, (_, i) => [`k${i}`, i])),
    },
    { label: 'string at 65536 chars (at limit)', value: { s: 'x'.repeat(65_536) } },
    { label: 'mixed nesting', value: { a: [{ b: [1, 2] }, { c: 'test' }] } },
  ];

  const invalidInputs: Array<{ label: string; value: unknown }> = [
    { label: 'depth 33 (exceeds limit)', value: buildNestedObject(33) },
    {
      label: 'array at 10001 (exceeds limit)',
      value: { arr: new Array(10_001).fill(0) },
    },
    {
      label: 'object at 1001 keys (exceeds limit)',
      value: Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`k${i}`, i])),
    },
    {
      label: 'string at 65537 chars (exceeds limit)',
      value: { s: 'x'.repeat(65_537) },
    },
  ];

  for (const { label, value } of validInputs) {
    it(`both accept: ${label}`, () => {
      const legacy = assertJsonSafeIterative(value);
      const modern = validateKernelConstraints(value);
      expect(legacy.ok).toBe(true);
      expect(modern.valid).toBe(true);
    });
  }

  for (const { label, value } of invalidInputs) {
    it(`both reject: ${label}`, () => {
      const legacy = assertJsonSafeIterative(value);
      const modern = validateKernelConstraints(value);
      expect(legacy.ok).toBe(false);
      expect(modern.valid).toBe(false);
    });
  }
});

/** Build a nested plain object at the given depth. */
function buildNestedObject(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < depth; i++) {
    obj = { nested: obj };
  }
  return obj;
}
