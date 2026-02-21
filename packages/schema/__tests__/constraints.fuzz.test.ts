/**
 * Fuzz boundary tests for kernel constraints (DD-60, DD-118)
 *
 * Tests boundary conditions at exact constraint limits:
 * - Depth: 31 (valid, leaf at 32), 32 (violation, leaf at 33), 33+ (violation)
 * - Array length: 9999, 10000, 10001
 * - Object keys: 999, 1000, 1001
 * - String length: 65535, 65536, 65537 code units
 * - Total nodes: structures approaching 100000
 * - Malformed inputs: null, empty, mixed boundaries
 */

import { describe, it, expect } from 'vitest';
import { KERNEL_CONSTRAINTS, validateKernelConstraints } from '../src/constraints';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an object nested to exactly `depth` levels below root */
function buildNested(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: 'value' };
  for (let i = 0; i < depth; i++) {
    obj = { nested: obj };
  }
  return obj;
}

/** Build an object with exactly `count` keys */
function buildWideObject(count: number): Record<string, number> {
  const obj: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    obj[`key_${i}`] = i;
  }
  return obj;
}

function hasViolation(
  result: { violations: Array<{ constraint: string }> },
  constraint: string
): boolean {
  return result.violations.some((v) => v.constraint === constraint);
}

// ---------------------------------------------------------------------------
// Depth boundaries
// ---------------------------------------------------------------------------

describe('Fuzz: depth boundaries', () => {
  it('depth 31 -- valid (leaf at depth 32, at the limit)', () => {
    // buildNested(31) -> 31 layers of {nested:...}, innermost {leaf:'value'} at depth 31,
    // primitive leaf at depth 32. Depth check: 32 > 32 is false -> valid.
    const claims = buildNested(31);
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(true);
  });

  it('depth 32 -- violation (leaf at depth 33 exceeds MAX_NESTED_DEPTH)', () => {
    // buildNested(32) -> 32 layers of nesting, primitive leaf at depth 33.
    // Depth check applies to ALL nodes including primitives (aligned with
    // assertJsonSafeIterative). 33 > 32 -> violation.
    const claims = buildNested(32);
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });

  it('depth 33 -- clear violation', () => {
    const claims = buildNested(33);
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });

  it('depth 34 -- clear violation', () => {
    const claims = buildNested(34);
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });

  it('primitive string leaf at depth 33 via arrays -- violation', () => {
    // Regression: depth check must apply to ALL nodes, not just containers.
    // 33 layers of single-element arrays wrapping a string leaf.
    let obj: unknown = 'leaf-value';
    for (let i = 0; i < 33; i++) {
      obj = [obj];
    }
    const claims = { root: obj };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });

  it('primitive number leaf at depth 33 via objects -- violation', () => {
    // Same regression test with a number leaf instead of string
    let obj: unknown = 42;
    for (let i = 0; i < 33; i++) {
      obj = { d: obj };
    }
    const claims = obj as Record<string, unknown>;
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Array length boundaries
// ---------------------------------------------------------------------------

describe('Fuzz: array length boundaries', () => {
  it('array length 9999 -- valid (under limit)', () => {
    const claims = { data: new Array(9999).fill(0) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_ARRAY_LENGTH')).toBe(false);
  });

  it('array length 10000 -- boundary (at MAX_ARRAY_LENGTH)', () => {
    const claims = { data: new Array(10_000).fill(0) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_ARRAY_LENGTH')).toBe(false);
  });

  it('array length 10001 -- violation (exceeds MAX_ARRAY_LENGTH)', () => {
    const claims = { data: new Array(10_001).fill(0) };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_ARRAY_LENGTH')).toBe(true);
    const violation = result.violations.find((v) => v.constraint === 'MAX_ARRAY_LENGTH');
    expect(violation!.actual).toBe(10_001);
    expect(violation!.limit).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Object keys boundaries
// ---------------------------------------------------------------------------

describe('Fuzz: object keys boundaries', () => {
  it('999 keys -- valid (under limit)', () => {
    const claims = { data: buildWideObject(999) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_OBJECT_KEYS')).toBe(false);
  });

  it('1000 keys -- boundary (at MAX_OBJECT_KEYS)', () => {
    const claims = { data: buildWideObject(1000) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_OBJECT_KEYS')).toBe(false);
  });

  it('1001 keys -- violation (exceeds MAX_OBJECT_KEYS)', () => {
    const claims = { data: buildWideObject(1001) };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_OBJECT_KEYS')).toBe(true);
    const violation = result.violations.find((v) => v.constraint === 'MAX_OBJECT_KEYS');
    expect(violation!.actual).toBe(1001);
    expect(violation!.limit).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// String length boundaries (byte length)
// ---------------------------------------------------------------------------

describe('Fuzz: string length boundaries (code units)', () => {
  it('65535 code units -- valid (under limit)', () => {
    const claims = { data: 'a'.repeat(65_535) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(false);
  });

  it('65536 code units -- boundary (at MAX_STRING_LENGTH)', () => {
    const claims = { data: 'a'.repeat(65_536) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(false);
  });

  it('65537 code units -- violation (exceeds MAX_STRING_LENGTH)', () => {
    const claims = { data: 'a'.repeat(65_537) };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
    const violation = result.violations.find((v) => v.constraint === 'MAX_STRING_LENGTH');
    expect(violation!.actual).toBe(65_537);
    expect(violation!.limit).toBe(65_536);
  });

  it('code units, not bytes: BMP chars are 1 code unit regardless of UTF-8 size', () => {
    // '\u00E9' is 1 code unit but 2 UTF-8 bytes.
    // With code-unit semantics, 65537 copies = 65537 code units (violates).
    const bmpChar = '\u00E9'; // e with accent, 1 code unit, 2 UTF-8 bytes
    expect(bmpChar.length).toBe(1);
    const claims = { data: bmpChar.repeat(65_537) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
  });

  it('surrogate pairs count as 2 code units', () => {
    // '\u{1F600}' = 2 code units (surrogate pair). 32769 emojis = 65538 code units.
    const emoji = '\u{1F600}';
    expect(emoji.length).toBe(2);
    const count = Math.ceil(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH / 2) + 1;
    const claims = { data: emoji.repeat(count) };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
  });

  it('string in array checked', () => {
    const bigString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
    const claims = { data: ['ok', bigString, 'also ok'] };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
  });

  it('string in nested object checked', () => {
    const bigString = 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1);
    const claims = { outer: { inner: { deep: bigString } } };
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Total nodes boundaries
// ---------------------------------------------------------------------------

describe('Fuzz: total nodes boundaries', () => {
  it('structure with ~99000 nodes -- valid', () => {
    // 9 arrays of 10000 primitives + root + 9 array objects = ~90011 nodes
    const claims: Record<string, unknown> = {};
    for (let i = 0; i < 9; i++) {
      claims[`a${i}`] = new Array(10_000).fill(i);
    }
    const result = validateKernelConstraints(claims);
    expect(hasViolation(result, 'MAX_TOTAL_NODES')).toBe(false);
  });

  it('structure with >100000 nodes -- violation', () => {
    // 11 arrays of 10000 primitives = ~110011 nodes
    const claims: Record<string, unknown> = {};
    for (let i = 0; i < 11; i++) {
      claims[`a${i}`] = new Array(10_000).fill(i);
    }
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_TOTAL_NODES')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Malformed inputs
// ---------------------------------------------------------------------------

describe('Fuzz: malformed inputs', () => {
  it('null', () => {
    const result = validateKernelConstraints(null);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('undefined', () => {
    const result = validateKernelConstraints(undefined);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('empty object', () => {
    const result = validateKernelConstraints({});
    expect(result.valid).toBe(true);
  });

  it('empty array', () => {
    const result = validateKernelConstraints([]);
    expect(result.valid).toBe(true);
  });

  it('number', () => {
    const result = validateKernelConstraints(42);
    expect(result.valid).toBe(true);
  });

  it('string', () => {
    const result = validateKernelConstraints('hello');
    expect(result.valid).toBe(true);
  });

  it('boolean', () => {
    const result = validateKernelConstraints(true);
    expect(result.valid).toBe(true);
  });

  it('nested empty arrays', () => {
    const result = validateKernelConstraints({ a: [[[]]] });
    expect(result.valid).toBe(true);
  });

  it('nested empty objects', () => {
    const result = validateKernelConstraints({ a: { b: { c: {} } } });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mixed boundary violations
// ---------------------------------------------------------------------------

describe('Fuzz: mixed boundary violations', () => {
  it('depth + array length violations simultaneously', () => {
    // Deep structure with an oversized array at the bottom
    let obj: Record<string, unknown> = {
      data: new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0),
    };
    for (let i = 0; i < 34; i++) {
      obj = { nested: obj };
    }
    const result = validateKernelConstraints(obj);
    expect(result.valid).toBe(false);
    // Should catch depth violation (stops traversal at max depth)
    expect(hasViolation(result, 'MAX_NESTED_DEPTH')).toBe(true);
  });

  it('object keys + string length in different branches', () => {
    const claims = {
      wide: buildWideObject(KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS + 1),
      long: 'x'.repeat(KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1),
    };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(hasViolation(result, 'MAX_OBJECT_KEYS')).toBe(true);
    expect(hasViolation(result, 'MAX_STRING_LENGTH')).toBe(true);
  });
});
