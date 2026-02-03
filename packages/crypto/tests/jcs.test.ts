/**
 * Tests for JSON Canonicalization Scheme (RFC 8785)
 */

import { describe, it, expect } from 'vitest';
import { canonicalize, jcsHash } from '../src/jcs';

describe('JSON Canonicalization (RFC 8785)', () => {
  it('should canonicalize null', () => {
    expect(canonicalize(null)).toBe('null');
  });

  it('should canonicalize booleans', () => {
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  it('should canonicalize numbers', () => {
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(-42)).toBe('-42');
    expect(canonicalize(3.14)).toBe('3.14');
  });

  it('should canonicalize strings', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize('')).toBe('""');
    expect(canonicalize('with"quotes')).toBe('"with\\"quotes"');
  });

  it('should canonicalize arrays', () => {
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalize([1, 'two', true, null])).toBe('[1,"two",true,null]');
    expect(
      canonicalize([
        [1, 2],
        [3, 4],
      ])
    ).toBe('[[1,2],[3,4]]');
  });

  it('should canonicalize objects with sorted keys', () => {
    expect(canonicalize({})).toBe('{}');
    expect(canonicalize({ a: 1 })).toBe('{"a":1}');
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ z: 26, a: 1, m: 13 })).toBe('{"a":1,"m":13,"z":26}');
  });

  it('should canonicalize nested objects', () => {
    const obj = {
      payment: {
        scheme: 'stripe',
        reference: 'cs_123',
        amount: 9999,
        currency: 'USD',
      },
      amt: 9999,
      cur: 'USD',
    };

    const expected =
      '{"amt":9999,"cur":"USD","payment":{"amount":9999,"currency":"USD","reference":"cs_123","scheme":"stripe"}}';
    expect(canonicalize(obj)).toBe(expected);
  });

  it('should produce identical output for equivalent objects with different key order', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };
    const obj3 = { b: 2, c: 3, a: 1 };

    const canon1 = canonicalize(obj1);
    const canon2 = canonicalize(obj2);
    const canon3 = canonicalize(obj3);

    expect(canon1).toBe(canon2);
    expect(canon2).toBe(canon3);
  });

  it('should reject non-finite numbers', () => {
    expect(() => canonicalize(Infinity)).toThrow('Cannot canonicalize non-finite number');
    expect(() => canonicalize(-Infinity)).toThrow('Cannot canonicalize non-finite number');
    expect(() => canonicalize(NaN)).toThrow('Cannot canonicalize non-finite number');
  });

  // =============================================================================
  // Undefined Handling (per JSON spec)
  // =============================================================================

  describe('undefined handling', () => {
    it('should throw for top-level undefined', () => {
      expect(() => canonicalize(undefined)).toThrow('Cannot canonicalize type: undefined');
    });

    it('should skip undefined values in objects (per JSON spec)', () => {
      // JSON.stringify({a: 1, b: undefined, c: 3}) === '{"a":1,"c":3}'
      expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
    });

    it('should convert undefined in arrays to null (per JSON spec)', () => {
      // JSON.stringify([1, undefined, 3]) === '[1,null,3]'
      expect(canonicalize([1, undefined, 3])).toBe('[1,null,3]');
    });

    it('should handle object with all undefined values', () => {
      // JSON.stringify({a: undefined, b: undefined}) === '{}'
      expect(canonicalize({ a: undefined, b: undefined })).toBe('{}');
    });

    it('should handle array with all undefined values', () => {
      // JSON.stringify([undefined, undefined]) === '[null,null]'
      expect(canonicalize([undefined, undefined])).toBe('[null,null]');
    });

    it('should handle nested undefined in objects', () => {
      const obj = {
        outer: {
          inner: undefined,
          kept: 'value',
        },
        removed: undefined,
      };
      // Undefined keys are removed at all nesting levels
      expect(canonicalize(obj)).toBe('{"outer":{"kept":"value"}}');
    });

    it('should handle nested undefined in arrays', () => {
      const arr = [[undefined], { a: undefined }];
      // Arrays convert undefined to null, objects skip undefined
      expect(canonicalize(arr)).toBe('[[null],{}]');
    });

    it('should match JSON.stringify behavior for undefined', () => {
      // Verify our implementation matches native JSON behavior
      const testCases = [
        { a: 1, b: undefined },
        [1, undefined, 2],
        { nested: { x: undefined, y: 1 } },
        [{ a: undefined }],
      ];

      for (const obj of testCases) {
        // Parse JSON.stringify result to normalize, then canonicalize
        const jsonResult = JSON.parse(JSON.stringify(obj));
        expect(canonicalize(obj)).toBe(canonicalize(jsonResult));
      }
    });
  });

  it('should compute JCS+SHA-256 hash', async () => {
    const obj = { a: 1, b: 2 };
    const hash = await jcsHash(obj);

    // Hash should be 64 hex characters (32 bytes)
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // Same object should produce same hash
    const hash2 = await jcsHash({ b: 2, a: 1 });
    expect(hash).toBe(hash2);
  });

  it('should produce different hashes for different objects', async () => {
    const hash1 = await jcsHash({ a: 1 });
    const hash2 = await jcsHash({ a: 2 });

    expect(hash1).not.toBe(hash2);
  });
});
