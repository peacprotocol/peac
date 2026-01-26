/**
 * Property-based tests for JCS (RFC 8785) canonicalization
 *
 * Uses fast-check to verify invariants across generated JSON values:
 * 1. Canonicalize -> parse -> canonicalize is stable (idempotency)
 * 2. Key ordering is deterministic (lexicographic Unicode code point order)
 * 3. Number representation is consistent
 * 4. Invalid values (Infinity, NaN, BigInt) are rejected
 *
 * IMPORTANT: All tests are deterministic (no Math.random) for reproducibility.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { _internals, canonicalizeEvidence, computeEvidenceDigest } from '../src/testing';

const { jcsCanonicalizeValue } = _internals;

// -----------------------------------------------------------------------------
// Deterministic key reordering helpers (no Math.random)
// -----------------------------------------------------------------------------

/**
 * Reverse key order - deterministic alternative to shuffle
 */
function reverseKeys<T>(obj: Record<string, T>): Record<string, T> {
  const keys = Object.keys(obj).reverse();
  const result: Record<string, T> = {};
  for (const k of keys) {
    result[k] = obj[k];
  }
  return result;
}

/**
 * Rotate keys by one position - another deterministic reorder
 */
function rotateKeys<T>(obj: Record<string, T>): Record<string, T> {
  const keys = Object.keys(obj);
  if (keys.length < 2) return { ...obj };
  const rotated = [...keys.slice(1), keys[0]];
  const result: Record<string, T> = {};
  for (const k of rotated) {
    result[k] = obj[k];
  }
  return result;
}

/**
 * Extract top-level keys from a canonical JSON string.
 *
 * This parser extracts keys directly from the string without using JSON.parse,
 * avoiding JavaScript's special enumeration rules for integer-like keys.
 *
 * Used to verify JCS key ordering at the string level.
 */
function extractTopLevelKeys(json: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;

  while (i < json.length) {
    const char = json[i];
    if (char === '{' || char === '[') {
      depth++;
      i++;
    } else if (char === '}' || char === ']') {
      depth--;
      i++;
    } else if (char === '"' && depth === 1) {
      // At top level, this might be a key
      const keyStart = i + 1;
      i++;
      // Find closing quote (handle escapes)
      while (i < json.length && json[i] !== '"') {
        if (json[i] === '\\') i++; // Skip escaped char
        i++;
      }
      const keyEnd = i;
      i++; // Move past closing quote
      // Check if followed by colon (it's a key)
      while (i < json.length && json[i] === ' ') i++;
      if (json[i] === ':') {
        keys.push(json.slice(keyStart, keyEnd));
      }
      i++;
    } else {
      i++;
    }
  }
  return keys;
}

// -----------------------------------------------------------------------------
// Arbitraries for generating test values
// -----------------------------------------------------------------------------

/**
 * Generate valid JSON primitives (JCS-safe subset)
 */
const jsonPrimitive = fc.oneof(
  fc.string(),
  fc.double({ noNaN: true, noDefaultInfinity: true }), // Finite numbers only
  fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
  fc.boolean(),
  fc.constant(null)
);

/**
 * Generate valid JSON values (recursive, JCS-safe)
 * Limited depth and size for performance
 */
const jsonValue = fc.letrec((tie) => ({
  primitive: jsonPrimitive,
  array: fc.array(tie('value'), { maxLength: 8 }),
  object: fc.dictionary(fc.string(), tie('value'), { maxKeys: 8 }),
  value: fc.oneof(
    { weight: 3, arbitrary: tie('primitive') },
    { weight: 1, arbitrary: tie('array') },
    { weight: 1, arbitrary: tie('object') },
  ),
})).value;

/**
 * Generate objects with unordered keys to test key sorting
 */
const unorderedObject = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,5}$/), // Short alpha keys for clearer sorting
  jsonPrimitive,
  { minKeys: 2, maxKeys: 6 }
);

/**
 * Generate nested objects with varying key orders
 */
const nestedUnorderedObject = fc.record({
  z: jsonPrimitive,
  a: jsonPrimitive,
  m: unorderedObject,
  nested: fc.option(unorderedObject),
});

/**
 * Generate number edge cases that JCS handles specially
 */
const numberEdgeCases = fc.oneof(
  fc.constant(0),
  fc.constant(-0), // Must normalize to 0
  fc.constant(Number.MAX_SAFE_INTEGER),
  fc.constant(Number.MIN_SAFE_INTEGER),
  fc.double({ min: -1e10, max: 1e10, noNaN: true, noDefaultInfinity: true }),
  fc.integer(),
);

// -----------------------------------------------------------------------------
// Property Tests: Canonicalization Stability (Idempotency)
// -----------------------------------------------------------------------------

describe('JCS canonicalization - property tests', () => {
  describe('idempotency (canonicalize -> parse -> canonicalize = stable)', () => {
    it('primitive values are stable through roundtrip', () => {
      fc.assert(
        fc.property(jsonPrimitive, (value) => {
          const canonical1 = jcsCanonicalizeValue(value);
          const parsed = JSON.parse(canonical1);
          const canonical2 = jcsCanonicalizeValue(parsed);

          return canonical1 === canonical2;
        }),
        { numRuns: 500 }
      );
    });

    it('complex values are stable through roundtrip', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const canonical1 = jcsCanonicalizeValue(value);
          const parsed = JSON.parse(canonical1);
          const canonical2 = jcsCanonicalizeValue(parsed);

          return canonical1 === canonical2;
        }),
        { numRuns: 200 }
      );
    });

    it('reversed key objects produce identical canonical output', () => {
      fc.assert(
        fc.property(unorderedObject, (obj) => {
          // Use deterministic reverse instead of random shuffle
          const reordered = reverseKeys(obj);

          const canonical1 = jcsCanonicalizeValue(obj);
          const canonical2 = jcsCanonicalizeValue(reordered);

          return canonical1 === canonical2;
        }),
        { numRuns: 200 }
      );
    });

    it('rotated key objects produce identical canonical output', () => {
      fc.assert(
        fc.property(unorderedObject, (obj) => {
          // Use deterministic rotation
          const reordered = rotateKeys(obj);

          const canonical1 = jcsCanonicalizeValue(obj);
          const canonical2 = jcsCanonicalizeValue(reordered);

          return canonical1 === canonical2;
        }),
        { numRuns: 200 }
      );
    });
  });

  describe('key ordering (lexicographic Unicode code point)', () => {
    it('keys are sorted alphabetically in output', () => {
      fc.assert(
        fc.property(unorderedObject, (obj) => {
          const canonical = jcsCanonicalizeValue(obj);
          const parsed = JSON.parse(canonical);
          const keys = Object.keys(parsed);

          // Verify keys are in sorted order
          const sortedKeys = [...keys].sort();
          return JSON.stringify(keys) === JSON.stringify(sortedKeys);
        }),
        { numRuns: 200 }
      );
    });

    it('nested objects have sorted keys at all levels', () => {
      fc.assert(
        fc.property(nestedUnorderedObject, (obj) => {
          const canonical = jcsCanonicalizeValue(obj);
          const parsed = JSON.parse(canonical);

          // Check root level
          const rootKeys = Object.keys(parsed);
          const rootSorted = [...rootKeys].sort();
          if (JSON.stringify(rootKeys) !== JSON.stringify(rootSorted)) {
            return false;
          }

          // Check nested level if present
          if (parsed.m && typeof parsed.m === 'object') {
            const nestedKeys = Object.keys(parsed.m);
            const nestedSorted = [...nestedKeys].sort();
            if (JSON.stringify(nestedKeys) !== JSON.stringify(nestedSorted)) {
              return false;
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * String-level key ordering verification
     *
     * This test validates key ordering directly in the canonical string output,
     * bypassing JSON.parse and Object.keys which have special enumeration rules
     * for integer-like keys in JavaScript.
     *
     * Example: { "0": "a", "10": "b", "2": "c" }
     * - JS Object.keys might enumerate as ["0", "2", "10"] (numeric order)
     * - JCS canonical output must be {"0":"a","10":"b","2":"c"} (lexicographic: 0 < 10 < 2)
     *
     * This test extracts keys directly from the string to verify correct ordering.
     */
    it('integer-like keys are sorted lexicographically (string-level verification)', () => {
      // Uses extractTopLevelKeys helper defined below (tested separately)
      // Test cases with integer-like keys that JS would reorder
      const testCases = [
        { '0': 'zero', '10': 'ten', '2': 'two' },
        { '9': 'nine', '1': 'one', '11': 'eleven' },
        { '100': 'hundred', '20': 'twenty', '3': 'three' },
        { 'a': 1, '1': 2, 'b': 3, '2': 4 },
      ];

      for (const obj of testCases) {
        const canonical = jcsCanonicalizeValue(obj);
        const extractedKeys = extractTopLevelKeys(canonical);
        const sortedKeys = [...extractedKeys].sort();

        // Keys in canonical output must match lexicographic sort
        expect(extractedKeys).toEqual(sortedKeys);

        // Verify against known expectations for integer-like keys
        // Lexicographic: "0" < "10" < "2" (because "1" < "2" at first char)
        if (JSON.stringify(Object.keys(obj).sort()) === '["0","10","2"]') {
          expect(extractedKeys).toEqual(['0', '10', '2']);
        }
      }
    });

    it('keys are sorted at string level for generated objects', () => {
      // Generate objects with mix of integer-like and string keys
      const integerLikeKeys = fc.dictionary(
        fc.stringMatching(/^[0-9]{1,3}$/), // 1-3 digit strings like "0", "10", "123"
        fc.constant('v'),
        { minKeys: 2, maxKeys: 5 }
      );

      fc.assert(
        fc.property(integerLikeKeys, (obj) => {
          const canonical = jcsCanonicalizeValue(obj);

          // Extract keys by finding "key": patterns at top level
          const keyPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
          const keys: string[] = [];
          let match;
          let depth = 0;
          let lastIndex = 0;

          // Only extract top-level keys
          for (let i = 0; i < canonical.length; i++) {
            if (canonical[i] === '{' || canonical[i] === '[') depth++;
            else if (canonical[i] === '}' || canonical[i] === ']') depth--;
            else if (canonical[i] === '"' && depth === 1) {
              // Check if this is a key (followed by :)
              const start = i + 1;
              i++;
              while (i < canonical.length && canonical[i] !== '"') {
                if (canonical[i] === '\\') i++;
                i++;
              }
              const end = i;
              i++;
              while (i < canonical.length && canonical[i] === ' ') i++;
              if (canonical[i] === ':') {
                keys.push(canonical.slice(start, end));
              }
            }
          }

          // Keys must be in lexicographic order
          const sortedKeys = [...keys].sort();
          return JSON.stringify(keys) === JSON.stringify(sortedKeys);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('number handling', () => {
    it('negative zero normalizes to positive zero', () => {
      const negZero = jcsCanonicalizeValue(-0);
      const posZero = jcsCanonicalizeValue(0);

      expect(negZero).toBe('0');
      expect(posZero).toBe('0');
      expect(negZero).toBe(posZero);
    });

    it('finite numbers produce valid JSON', () => {
      fc.assert(
        fc.property(numberEdgeCases, (num) => {
          if (!Number.isFinite(num)) return true; // Skip invalid

          const canonical = jcsCanonicalizeValue(num);
          const parsed = JSON.parse(canonical);

          // -0 normalizes to 0, otherwise should match
          if (Object.is(num, -0)) {
            return parsed === 0 && !Object.is(parsed, -0);
          }
          return parsed === num;
        }),
        { numRuns: 200 }
      );
    });

    it('large safe integers are represented exactly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
          (num) => {
            const canonical = jcsCanonicalizeValue(num);
            const parsed = JSON.parse(canonical);
            return parsed === num;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('invalid values rejected', () => {
    // Use regex matchers for resilience to message changes
    it('rejects NaN', () => {
      expect(() => jcsCanonicalizeValue(NaN)).toThrow(/Infinity|NaN/i);
    });

    it('rejects Infinity', () => {
      expect(() => jcsCanonicalizeValue(Infinity)).toThrow(/Infinity|NaN/i);
    });

    it('rejects -Infinity', () => {
      expect(() => jcsCanonicalizeValue(-Infinity)).toThrow(/Infinity|NaN/i);
    });

    it('rejects BigInt', () => {
      expect(() => jcsCanonicalizeValue(BigInt(123))).toThrow(/bigint/i);
    });

    it('rejects functions', () => {
      expect(() => jcsCanonicalizeValue(() => {})).toThrow(/function/i);
    });

    it('rejects symbols', () => {
      expect(() => jcsCanonicalizeValue(Symbol('test'))).toThrow(/symbol/i);
    });

    /**
     * DESIGN NOTE: undefined values in objects are filtered out per JSON semantics.
     * JSON.stringify({ a: 1, b: undefined }) === '{"a":1}'
     * This is consistent with standard JSON behavior, not a JCS-specific decision.
     */
    it('undefined values in objects are filtered out (JSON semantics)', () => {
      const obj = { a: 1, b: undefined, c: 3 };
      const canonical = jcsCanonicalizeValue(obj);
      expect(canonical).toBe('{"a":1,"c":3}');
    });
  });

  describe('digest stability', () => {
    it('same input produces same digest', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          // Create an evidence-like object
          const evidence = {
            schema_version: 'peac-safe-fetch-evidence/0.1' as const,
            data: value,
          };

          const digest1 = computeEvidenceDigest(evidence);
          const digest2 = computeEvidenceDigest(evidence);

          return digest1 === digest2;
        }),
        { numRuns: 100 }
      );
    });

    it('different key order produces same digest (reverse)', () => {
      fc.assert(
        fc.property(unorderedObject, (obj) => {
          const evidence1 = {
            schema_version: 'peac-safe-fetch-evidence/0.1' as const,
            payload: obj,
          };

          // Use deterministic reverse instead of random shuffle
          const reordered = reverseKeys(obj);
          const evidence2 = {
            schema_version: 'peac-safe-fetch-evidence/0.1' as const,
            payload: reordered,
          };

          const digest1 = computeEvidenceDigest(evidence1);
          const digest2 = computeEvidenceDigest(evidence2);

          return digest1 === digest2;
        }),
        { numRuns: 100 }
      );
    });

    it('digest is 0x-prefixed lowercase hex (66 chars for SHA-256)', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const evidence = {
            schema_version: 'peac-safe-fetch-evidence/0.1' as const,
            data: value,
          };

          const digest = computeEvidenceDigest(evidence);

          return (
            digest.startsWith('0x') &&
            digest.length === 66 && // 0x + 64 hex chars
            /^0x[0-9a-f]{64}$/.test(digest)
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('canonicalizeEvidence wrapper', () => {
    it('produces same output as jcsCanonicalizeValue for evidence objects', () => {
      fc.assert(
        fc.property(jsonValue, (value) => {
          const evidence = {
            schema_version: 'peac-safe-fetch-evidence/0.1' as const,
            data: value,
          };

          const direct = jcsCanonicalizeValue(evidence);
          const wrapped = canonicalizeEvidence(evidence as any);

          return direct === wrapped;
        }),
        { numRuns: 100 }
      );
    });
  });
});

// -----------------------------------------------------------------------------
// Key Extractor Unit Tests
// -----------------------------------------------------------------------------

describe('extractTopLevelKeys helper', () => {
  it('extracts keys from simple object', () => {
    expect(extractTopLevelKeys('{"a":1,"b":2}')).toEqual(['a', 'b']);
  });

  it('extracts keys in order from canonical output', () => {
    expect(extractTopLevelKeys('{"a":1,"m":2,"z":3}')).toEqual(['a', 'm', 'z']);
  });

  it('extracts integer-like keys in lexicographic order', () => {
    // This is the critical test: JCS sorts "0" < "10" < "2" lexicographically
    // JS Object.keys would return ["0", "2", "10"] (numeric order)
    expect(extractTopLevelKeys('{"0":"zero","10":"ten","2":"two"}')).toEqual(['0', '10', '2']);
  });

  it('handles escaped quotes in keys', () => {
    // Key with escaped quote: "key\"quote"
    expect(extractTopLevelKeys('{"key\\"quote":1}')).toEqual(['key\\"quote']);
  });

  it('handles escaped backslash in keys', () => {
    // Key with escaped backslash: "key\\slash"
    expect(extractTopLevelKeys('{"key\\\\slash":1}')).toEqual(['key\\\\slash']);
  });

  it('handles unicode in keys', () => {
    // Greek letters
    expect(extractTopLevelKeys('{"greek":"value"}')).toEqual(['greek']);
  });

  it('handles unicode escape sequences in keys', () => {
    // Control character escaped: \u0000
    expect(extractTopLevelKeys('{"ctrl\\u0000key":1}')).toEqual(['ctrl\\u0000key']);
  });

  it('handles special characters in keys (dash, dot, underscore)', () => {
    const canonical = '{"key-with-dash":1,"key.with.dot":2,"key_with_underscore":3}';
    expect(extractTopLevelKeys(canonical)).toEqual([
      'key-with-dash',
      'key.with.dot',
      'key_with_underscore',
    ]);
  });

  it('ignores nested object keys', () => {
    // Only extract top-level keys, not nested
    expect(extractTopLevelKeys('{"outer":{"inner":"value"}}')).toEqual(['outer']);
  });

  it('ignores nested array contents', () => {
    expect(extractTopLevelKeys('{"arr":[1,2,3]}')).toEqual(['arr']);
  });

  it('handles mixed content (nested objects and arrays)', () => {
    const canonical = '{"a":1,"nested":{"b":2},"arr":[3,4],"z":"end"}';
    expect(extractTopLevelKeys(canonical)).toEqual(['a', 'nested', 'arr', 'z']);
  });

  it('handles empty object', () => {
    expect(extractTopLevelKeys('{}')).toEqual([]);
  });

  it('handles strings that look like objects in values', () => {
    // The value is a string containing {}, should not confuse the parser
    expect(extractTopLevelKeys('{"key":"{nested}"}')).toEqual(['key']);
  });

  it('handles surrogate pair emoji in values (not keys)', () => {
    expect(extractTopLevelKeys('{"party":"value"}')).toEqual(['party']);
  });

  it('verifies ordering against golden vectors', () => {
    // Verify against known canonical outputs from golden vectors
    const vectors = [
      { canonical: '{"a":1,"b":2}', expected: ['a', 'b'] },
      { canonical: '{"a":1,"m":2,"z":3}', expected: ['a', 'm', 'z'] },
      { canonical: '{"f":false,"t":true}', expected: ['f', 't'] },
      { canonical: '{"0":"zero","10":"ten","2":"two"}', expected: ['0', '10', '2'] },
      { canonical: '{"key-with-dash":1,"key.with.dot":2,"key_with_underscore":3}',
        expected: ['key-with-dash', 'key.with.dot', 'key_with_underscore'] },
    ];

    for (const { canonical, expected } of vectors) {
      const extracted = extractTopLevelKeys(canonical);
      expect(extracted).toEqual(expected);
      // Also verify they're in sorted order
      const sorted = [...extracted].sort();
      expect(extracted).toEqual(sorted);
    }
  });
});

// -----------------------------------------------------------------------------
// Invariant Tests
// -----------------------------------------------------------------------------

describe('JCS invariants', () => {
  it('JSON.stringify never throws for canonicalized-then-parsed values', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonical = jcsCanonicalizeValue(value);
        const parsed = JSON.parse(canonical);

        try {
          JSON.stringify(parsed);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('canonical output is always valid JSON', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonical = jcsCanonicalizeValue(value);

        try {
          JSON.parse(canonical);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('canonical output has no whitespace between tokens', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const canonical = jcsCanonicalizeValue(value);

        // Should not have whitespace between structural tokens
        // (but strings can contain whitespace)
        const withoutStrings = canonical.replace(/"(?:[^"\\]|\\.)*"/g, '""');
        return !/\s/.test(withoutStrings);
      }),
      { numRuns: 200 }
    );
  });
});
