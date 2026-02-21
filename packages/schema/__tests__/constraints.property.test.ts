/**
 * Property-based tests for kernel constraints (DD-60, DD-118)
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. validateKernelConstraints() never throws for any input
 * 2. Claims within all limits -> valid: true, violations: []
 * 3. Claims exceeding any single limit -> valid: false, violation names the constraint
 * 4. Violation count >= 1 for every invalid result
 * 5. Result structure invariant (valid <=> violations.length === 0)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { KERNEL_CONSTRAINTS, validateKernelConstraints } from '../src/constraints';
import { assertJsonSafeIterative } from '../src/json';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate safe JSON primitives */
const jsonPrimitive = fc.oneof(
  fc.string({ maxLength: 100 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null)
);

/** Generate small, valid JSON values (within all limits) */
const smallJsonValue = fc.letrec((tie) => ({
  primitive: jsonPrimitive,
  array: fc.array(tie('value'), { maxLength: 5 }),
  object: fc.dictionary(fc.string({ maxLength: 20 }), tie('value'), { maxKeys: 5 }),
  value: fc.oneof(
    { weight: 4, arbitrary: tie('primitive') },
    { weight: 1, arbitrary: tie('array') },
    { weight: 1, arbitrary: tie('object') }
  ),
})).value;

/** Generate receipt-like claims objects (within limits) */
const validClaims = fc.record({
  iss: fc.webUrl(),
  sub: fc.webUrl(),
  iat: fc.integer({ min: 1_000_000_000, max: 2_000_000_000 }),
  rid: fc.uuid(),
  auth: fc.record({
    method: fc.constantFrom('oauth2', 'api-key', 'signature'),
    verified: fc.boolean(),
  }),
  evidence: fc.dictionary(fc.string({ maxLength: 20 }), jsonPrimitive, { maxKeys: 5 }),
});

/** Generate arbitrary unknown values (including non-JSON types) */
const anyValue = fc.oneof(
  jsonPrimitive,
  fc.constant(undefined),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(Symbol('test')),
  fc.constant(() => {}),
  fc.constant(new Date()),
  fc.constant(new Map()),
  smallJsonValue
);

// ---------------------------------------------------------------------------
// Property 1: Never throws
// ---------------------------------------------------------------------------

describe('Property: validateKernelConstraints never throws', () => {
  it('never throws for arbitrary unknown values', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        // Must not throw -- always returns a result
        const result = validateKernelConstraints(value);
        return typeof result.valid === 'boolean';
      }),
      { numRuns: 500 }
    );
  });

  it('never throws for generated JSON values', () => {
    fc.assert(
      fc.property(smallJsonValue, (value) => {
        const result = validateKernelConstraints(value);
        return typeof result.valid === 'boolean';
      }),
      { numRuns: 300 }
    );
  });

  it('never throws for deeply nested objects', () => {
    fc.assert(
      fc.property(fc.nat({ max: 40 }), (depth) => {
        let obj: Record<string, unknown> = { leaf: true };
        for (let i = 0; i < depth; i++) {
          obj = { n: obj };
        }
        const result = validateKernelConstraints(obj);
        return typeof result.valid === 'boolean';
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Claims within all limits -> valid
// ---------------------------------------------------------------------------

describe('Property: within-limits claims are valid', () => {
  it('valid receipt-like claims pass', () => {
    fc.assert(
      fc.property(validClaims, (claims) => {
        const result = validateKernelConstraints(claims);
        return result.valid === true && result.violations.length === 0;
      }),
      { numRuns: 200 }
    );
  });

  it('small JSON values pass', () => {
    fc.assert(
      fc.property(smallJsonValue, (value) => {
        // Wrap in an object (validateKernelConstraints short-circuits for non-objects)
        const claims = { data: value };
        const result = validateKernelConstraints(claims);
        return result.valid === true;
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Exceeding a single limit -> violation names the constraint
// ---------------------------------------------------------------------------

describe('Property: exceeding limits produces named violations', () => {
  it('depth violation names MAX_NESTED_DEPTH', () => {
    fc.assert(
      fc.property(fc.integer({ min: 33, max: 40 }), (depth) => {
        let obj: Record<string, unknown> = { leaf: true };
        for (let i = 0; i < depth; i++) {
          obj = { n: obj };
        }
        const result = validateKernelConstraints(obj);
        return (
          result.valid === false &&
          result.violations.some((v) => v.constraint === 'MAX_NESTED_DEPTH')
        );
      }),
      { numRuns: 20 }
    );
  });

  it('oversized array names MAX_ARRAY_LENGTH', () => {
    const size = KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1;
    const claims = { data: new Array(size).fill(0) };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.constraint === 'MAX_ARRAY_LENGTH')).toBe(true);
  });

  it('oversized object names MAX_OBJECT_KEYS', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i <= KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS; i++) {
      obj[`k${i}`] = i;
    }
    const claims = { data: obj };
    const result = validateKernelConstraints(claims);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.constraint === 'MAX_OBJECT_KEYS')).toBe(true);
  });

  it('oversized string names MAX_STRING_LENGTH', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1,
          max: KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 100,
        }),
        (length) => {
          const claims = { data: 'a'.repeat(length) };
          const result = validateKernelConstraints(claims);
          return (
            result.valid === false &&
            result.violations.some((v) => v.constraint === 'MAX_STRING_LENGTH')
          );
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Violation count >= 1 for invalid results
// ---------------------------------------------------------------------------

describe('Property: invalid results have >= 1 violation', () => {
  it('every invalid result has at least one violation', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = validateKernelConstraints(value);
        if (result.valid) {
          return result.violations.length === 0;
        }
        return result.violations.length >= 1;
      }),
      { numRuns: 300 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: valid <=> violations.length === 0
// ---------------------------------------------------------------------------

describe('Property: valid flag matches violations array', () => {
  it('valid is true iff violations is empty', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = validateKernelConstraints(value);
        return result.valid === (result.violations.length === 0);
      }),
      { numRuns: 500 }
    );
  });

  it('valid is true iff violations is empty (for objects)', () => {
    fc.assert(
      fc.property(validClaims, (claims) => {
        const result = validateKernelConstraints(claims);
        return result.valid === (result.violations.length === 0);
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property: violation structure invariants
// ---------------------------------------------------------------------------

describe('Property: violation structure', () => {
  it('every violation has a valid constraint name', () => {
    const validKeys = Object.keys(KERNEL_CONSTRAINTS);
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = validateKernelConstraints(value);
        return result.violations.every((v) => validKeys.includes(v.constraint));
      }),
      { numRuns: 300 }
    );
  });

  it('every violation has numeric actual and limit', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = validateKernelConstraints(value);
        return result.violations.every(
          (v) => typeof v.actual === 'number' && typeof v.limit === 'number'
        );
      }),
      { numRuns: 300 }
    );
  });

  it('violation actual always exceeds limit', () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const result = validateKernelConstraints(value);
        return result.violations.every((v) => v.actual > v.limit);
      }),
      { numRuns: 300 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Semantic equivalence with assertJsonSafeIterative
// ---------------------------------------------------------------------------

describe('Property: semantic equivalence with assertJsonSafeIterative', () => {
  /**
   * For JSON-safe plain objects within structural limits, both validators
   * must agree: assertJsonSafeIterative().ok === true iff
   * validateKernelConstraints().valid === true.
   *
   * Scope: only JSON-safe inputs (no undefined, NaN, symbols, functions,
   * non-plain objects). assertJsonSafeIterative rejects those for JSON-safety
   * reasons, not structural limits -- that's a different concern.
   */

  it('both accept small JSON-safe objects', () => {
    fc.assert(
      fc.property(validClaims, (claims) => {
        const jsonResult = assertJsonSafeIterative(claims);
        const constraintResult = validateKernelConstraints(claims);
        // Both should accept valid receipt-like claims
        return jsonResult.ok === true && constraintResult.valid === true;
      }),
      { numRuns: 200 }
    );
  });

  it('both accept small nested JSON values', () => {
    fc.assert(
      fc.property(smallJsonValue, (value) => {
        const claims = { data: value };
        const jsonResult = assertJsonSafeIterative(claims);
        const constraintResult = validateKernelConstraints(claims);
        // Small JSON values are within all limits
        return jsonResult.ok === true && constraintResult.valid === true;
      }),
      { numRuns: 200 }
    );
  });

  it('both reject depth violations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 33, max: 40 }), (depth) => {
        let obj: Record<string, unknown> = { leaf: true };
        for (let i = 0; i < depth; i++) {
          obj = { n: obj };
        }
        const jsonResult = assertJsonSafeIterative(obj);
        const constraintResult = validateKernelConstraints(obj);
        return jsonResult.ok === false && constraintResult.valid === false;
      }),
      { numRuns: 20 }
    );
  });

  it('both reject oversized strings', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 1,
          max: KERNEL_CONSTRAINTS.MAX_STRING_LENGTH + 50,
        }),
        (length) => {
          const claims = { data: 'a'.repeat(length) };
          const jsonResult = assertJsonSafeIterative(claims);
          const constraintResult = validateKernelConstraints(claims);
          return jsonResult.ok === false && constraintResult.valid === false;
        }
      ),
      { numRuns: 10 }
    );
  });

  it('both reject oversized arrays', () => {
    const claims = { data: new Array(KERNEL_CONSTRAINTS.MAX_ARRAY_LENGTH + 1).fill(0) };
    const jsonResult = assertJsonSafeIterative(claims);
    const constraintResult = validateKernelConstraints(claims);
    expect(jsonResult.ok).toBe(false);
    expect(constraintResult.valid).toBe(false);
  });

  it('both reject oversized objects', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i <= KERNEL_CONSTRAINTS.MAX_OBJECT_KEYS; i++) {
      obj[`k${i}`] = i;
    }
    const claims = { data: obj };
    const jsonResult = assertJsonSafeIterative(claims);
    const constraintResult = validateKernelConstraints(claims);
    expect(jsonResult.ok).toBe(false);
    expect(constraintResult.valid).toBe(false);
  });
});
