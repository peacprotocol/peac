/**
 * Property-based tests for JSON-safe validation
 *
 * Uses fast-check to verify invariants across generated values:
 * 1. Valid JSON values always pass assertJsonSafeIterative
 * 2. Diamond structures (shared refs) pass, cycles fail
 * 3. Non-JSON types are always rejected
 * 4. JSON roundtrip preservation for valid values
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { assertJsonSafeIterative, JSON_EVIDENCE_LIMITS } from '../src/json';
import { validateEvidence } from '../src/validators';

// -----------------------------------------------------------------------------
// Arbitraries for generating test values
// -----------------------------------------------------------------------------

/**
 * Generate valid JSON primitives
 */
const jsonPrimitive = fc.oneof(
  fc.string(),
  fc.double({ noNaN: true, noDefaultInfinity: true }), // Finite numbers only
  fc.integer(),
  fc.boolean(),
  fc.constant(null)
);

/**
 * Generate valid JSON values (recursive)
 * Limited depth for performance
 */
const jsonValue = fc.letrec((tie) => ({
  primitive: jsonPrimitive,
  array: fc.array(tie('value'), { maxLength: 10 }),
  object: fc.dictionary(fc.string(), tie('value'), { maxKeys: 10 }),
  value: fc.oneof(
    { weight: 3, arbitrary: tie('primitive') },
    { weight: 1, arbitrary: tie('array') },
    { weight: 1, arbitrary: tie('object') }
  ),
})).value;

/**
 * Generate deeply nested but valid structures
 */
const deepNested = fc.nat({ max: 20 }).chain((depth) => {
  let arb: fc.Arbitrary<unknown> = fc.constant('leaf');
  for (let i = 0; i < depth; i++) {
    arb = arb.map((inner) => ({ nested: inner }));
  }
  return arb;
});

/**
 * Generate non-JSON types that should be rejected
 */
const nonJsonType = fc.oneof(
  fc.constant(undefined),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.bigInt().map((n) => n), // BigInt
  fc.constant(Symbol('test')),
  fc.constant(() => {}), // Function
  fc.constant(new Date()),
  fc.constant(new Map()),
  fc.constant(new Set()),
  fc.constant(new RegExp('test'))
);

/**
 * Generate structures with non-JSON values embedded
 */
const structureWithNonJson = fc.oneof(
  // Non-JSON at root
  nonJsonType,
  // Non-JSON in array
  fc.tuple(fc.array(jsonPrimitive), fc.nat({ max: 10 }), nonJsonType).map(([arr, idx, bad]) => {
    const result = [...arr];
    result.splice(idx % (arr.length + 1), 0, bad);
    return result;
  }),
  // Non-JSON in object
  fc
    .tuple(fc.dictionary(fc.string(), jsonPrimitive), fc.string(), nonJsonType)
    .map(([obj, key, bad]) => ({ ...obj, [key]: bad })),
  // Non-JSON nested
  fc.tuple(jsonValue, nonJsonType).map(([valid, bad]) => ({
    valid,
    nested: { bad },
  }))
);

// -----------------------------------------------------------------------------
// Property Tests: assertJsonSafeIterative
// -----------------------------------------------------------------------------

describe('assertJsonSafeIterative - property tests', () => {
  describe('valid JSON values', () => {
    it('accepts any valid JSON primitive', () => {
      fc.assert(
        fc.property(jsonPrimitive, (value) => {
          const result = assertJsonSafeIterative(value);
          return result.ok === true;
        }),
        { numRuns: 500 }
      );
    });

    it('accepts any valid JSON value (recursive)', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const result = assertJsonSafeIterative(value);
          return result.ok === true;
        }),
        { numRuns: 200 }
      );
    });

    it('accepts deeply nested structures within limits', () => {
      fc.assert(
        fc.property(deepNested, (value) => {
          const result = assertJsonSafeIterative(value);
          return result.ok === true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('JSON roundtrip preservation', () => {
    it('valid JSON values survive roundtrip unchanged', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const result = assertJsonSafeIterative(value);
          if (!result.ok) return true; // Skip if invalid (shouldn't happen)

          // Roundtrip should not throw
          const roundtripped = JSON.parse(JSON.stringify(value));

          // Deep equality check (JSON.stringify for comparison)
          return JSON.stringify(value) === JSON.stringify(roundtripped);
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('non-JSON types rejected', () => {
    it('rejects all non-JSON types', () => {
      fc.assert(
        fc.property(nonJsonType, (value) => {
          const result = assertJsonSafeIterative(value);
          return result.ok === false;
        }),
        { numRuns: 100 }
      );
    });

    it('rejects structures containing non-JSON values', () => {
      fc.assert(
        fc.property(structureWithNonJson, (value) => {
          const result = assertJsonSafeIterative(value);
          return result.ok === false;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('diamond vs cycle detection', () => {
    it('accepts diamond structures (same object, multiple refs)', () => {
      fc.assert(
        fc.property(jsonValue, (leaf) => {
          // Diamond: shared references but no cycle
          const shared = { value: leaf };
          const diamond = {
            left: shared,
            right: shared,
            both: [shared, shared],
          };

          const result = assertJsonSafeIterative(diamond);
          return result.ok === true;
        }),
        { numRuns: 100 }
      );
    });

    it('rejects cycles (direct self-reference)', () => {
      fc.assert(
        fc.property(fc.string(), (key) => {
          const obj: Record<string, unknown> = { data: 'test' };
          obj[key || 'self'] = obj; // Direct cycle

          const result = assertJsonSafeIterative(obj);
          return result.ok === false && result.error.includes('Cycle');
        }),
        { numRuns: 50 }
      );
    });

    it('rejects cycles (indirect A -> B -> A)', () => {
      fc.assert(
        fc.property(jsonPrimitive, (payload) => {
          const a: Record<string, unknown> = { payload };
          const b: Record<string, unknown> = { parent: a };
          a.child = b; // Indirect cycle

          const result = assertJsonSafeIterative(a);
          return result.ok === false && result.error.includes('Cycle');
        }),
        { numRuns: 50 }
      );
    });

    it('distinguishes diamond from cycle correctly', () => {
      // This is the key invariant: diamonds pass, cycles fail
      fc.assert(
        fc.property(jsonPrimitive, (value) => {
          const shared = { value };

          // Diamond (valid): two paths to same object, but no back-reference
          const diamond = { a: shared, b: shared };
          const diamondResult = assertJsonSafeIterative(diamond);

          // Cycle (invalid): object references itself through descendant
          const cycle: Record<string, unknown> = { value };
          cycle.self = cycle;
          const cycleResult = assertJsonSafeIterative(cycle);

          return diamondResult.ok === true && cycleResult.ok === false;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('DoS limits', () => {
    it('respects maxDepth limit', () => {
      fc.assert(
        fc.property(fc.nat({ max: 50 }), (wrapCount) => {
          // Build nested object with wrapCount levels of wrapping
          // Actual max depth = wrapCount + 1 (for the initial leaf object value)
          let obj: Record<string, unknown> = { leaf: true };
          for (let i = 0; i < wrapCount; i++) {
            obj = { nested: obj };
          }

          const result = assertJsonSafeIterative(obj, {
            maxDepth: JSON_EVIDENCE_LIMITS.maxDepth,
          });

          // With wrapCount wraps, the deepest value is at depth wrapCount + 1
          // (root at 0, first nested at 1, ..., leaf value at wrapCount + 1)
          const actualMaxDepth = wrapCount + 1;

          if (actualMaxDepth > JSON_EVIDENCE_LIMITS.maxDepth) {
            return result.ok === false && result.error.includes('depth');
          } else {
            return result.ok === true;
          }
        }),
        { numRuns: 100 }
      );
    });

    it('respects maxArrayLength limit', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), (length) => {
          const arr = Array.from({ length }, (_, i) => i);
          const limit = 50;

          const result = assertJsonSafeIterative(arr, { maxArrayLength: limit });

          if (length > limit) {
            return result.ok === false && result.error.includes('Array');
          } else {
            return result.ok === true;
          }
        }),
        { numRuns: 100 }
      );
    });

    it('respects maxObjectKeys limit', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), (keyCount) => {
          const obj: Record<string, number> = {};
          for (let i = 0; i < keyCount; i++) {
            obj[`key${i}`] = i;
          }
          const limit = 50;

          const result = assertJsonSafeIterative(obj, { maxObjectKeys: limit });

          if (keyCount > limit) {
            return result.ok === false && result.error.includes('key count');
          } else {
            return result.ok === true;
          }
        }),
        { numRuns: 100 }
      );
    });

    it('respects maxStringLength limit', () => {
      fc.assert(
        fc.property(fc.nat({ max: 200 }), (length) => {
          const str = 'x'.repeat(length);
          const limit = 100;

          const result = assertJsonSafeIterative(str, { maxStringLength: limit });

          if (length > limit) {
            return result.ok === false && result.error.includes('String');
          } else {
            return result.ok === true;
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});

// -----------------------------------------------------------------------------
// Property Tests: validateEvidence
// -----------------------------------------------------------------------------

describe('validateEvidence - property tests', () => {
  describe('valid evidence', () => {
    it('returns ok for any valid JSON value', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const result = validateEvidence(value);
          return result.ok === true;
        }),
        { numRuns: 200 }
      );
    });

    it('returned value equals input for valid evidence', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const result = validateEvidence(value);
          if (!result.ok) return true;

          return JSON.stringify(result.value) === JSON.stringify(value);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('invalid evidence', () => {
    it('returns error for non-JSON types', () => {
      fc.assert(
        fc.property(nonJsonType, (value) => {
          const result = validateEvidence(value);
          return result.ok === false && result.error.code === 'E_EVIDENCE_NOT_JSON';
        }),
        { numRuns: 50 }
      );
    });

    it('error includes remediation guidance', () => {
      fc.assert(
        fc.property(structureWithNonJson, (value) => {
          const result = validateEvidence(value);
          if (result.ok) return true; // Skip if somehow valid

          return (
            result.error.code === 'E_EVIDENCE_NOT_JSON' &&
            typeof result.error.remediation === 'string' &&
            result.error.remediation.length > 0
          );
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('consistency with assertJsonSafeIterative', () => {
    it('validateEvidence agrees with assertJsonSafeIterative', () => {
      fc.assert(
        fc.property(fc.oneof(jsonValue, structureWithNonJson), (value) => {
          const iterativeResult = assertJsonSafeIterative(value);
          const evidenceResult = validateEvidence(value);

          return iterativeResult.ok === evidenceResult.ok;
        }),
        { numRuns: 200 }
      );
    });
  });
});

// -----------------------------------------------------------------------------
// Invariant Tests
// -----------------------------------------------------------------------------

describe('invariants', () => {
  it('JSON.stringify never throws for values passing assertJsonSafeIterative', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const result = assertJsonSafeIterative(value);
        if (!result.ok) return true;

        // This should never throw
        try {
          JSON.stringify(value);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('JSON.parse(JSON.stringify(x)) is idempotent for valid values', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const result = assertJsonSafeIterative(value);
        if (!result.ok) return true;

        const once = JSON.parse(JSON.stringify(value));
        const twice = JSON.parse(JSON.stringify(once));

        return JSON.stringify(once) === JSON.stringify(twice);
      }),
      { numRuns: 100 }
    );
  });

  it('error path is always an array', () => {
    fc.assert(
      fc.property(structureWithNonJson, (value) => {
        const result = assertJsonSafeIterative(value);
        if (result.ok) return true;

        return Array.isArray(result.path);
      }),
      { numRuns: 100 }
    );
  });

  it('error message is always a non-empty string', () => {
    fc.assert(
      fc.property(structureWithNonJson, (value) => {
        const result = assertJsonSafeIterative(value);
        if (result.ok) return true;

        return typeof result.error === 'string' && result.error.length > 0;
      }),
      { numRuns: 100 }
    );
  });
});
