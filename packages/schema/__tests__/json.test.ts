/**
 * Tests for JSON-safe validation schemas
 *
 * Validates that JsonValueSchema correctly:
 * - Accepts all valid JSON values
 * - Rejects non-JSON-safe values (undefined, NaN, Infinity, BigInt, Date, etc.)
 * - Provides correct error paths for nested invalid values
 */

import { describe, it, expect } from 'vitest';
import {
  JsonPrimitiveSchema,
  JsonValueSchema,
  JsonObjectSchema,
  JsonArraySchema,
  assertJsonSafeIterative,
  JSON_EVIDENCE_LIMITS,
} from '../src/json';
import { validateEvidence } from '../src/validators';

/**
 * Test utility: assert value survives JSON roundtrip unchanged
 * This is test-only, not exported from package root.
 */
function assertJsonRoundtrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('JsonPrimitiveSchema', () => {
  describe('valid primitives', () => {
    it('accepts string', () => {
      expect(JsonPrimitiveSchema.safeParse('hello').success).toBe(true);
    });

    it('accepts empty string', () => {
      expect(JsonPrimitiveSchema.safeParse('').success).toBe(true);
    });

    it('accepts integer', () => {
      expect(JsonPrimitiveSchema.safeParse(42).success).toBe(true);
    });

    it('accepts negative integer', () => {
      expect(JsonPrimitiveSchema.safeParse(-100).success).toBe(true);
    });

    it('accepts float', () => {
      expect(JsonPrimitiveSchema.safeParse(3.14159).success).toBe(true);
    });

    it('accepts zero', () => {
      expect(JsonPrimitiveSchema.safeParse(0).success).toBe(true);
    });

    it('accepts boolean true', () => {
      expect(JsonPrimitiveSchema.safeParse(true).success).toBe(true);
    });

    it('accepts boolean false', () => {
      expect(JsonPrimitiveSchema.safeParse(false).success).toBe(true);
    });

    it('accepts null', () => {
      expect(JsonPrimitiveSchema.safeParse(null).success).toBe(true);
    });
  });

  describe('invalid primitives', () => {
    it('rejects NaN', () => {
      const result = JsonPrimitiveSchema.safeParse(NaN);
      expect(result.success).toBe(false);
    });

    it('rejects Infinity', () => {
      const result = JsonPrimitiveSchema.safeParse(Infinity);
      expect(result.success).toBe(false);
    });

    it('rejects -Infinity', () => {
      const result = JsonPrimitiveSchema.safeParse(-Infinity);
      expect(result.success).toBe(false);
    });

    it('rejects undefined', () => {
      const result = JsonPrimitiveSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });
});

describe('JsonValueSchema', () => {
  describe('valid values', () => {
    it('accepts primitives', () => {
      expect(JsonValueSchema.safeParse('string').success).toBe(true);
      expect(JsonValueSchema.safeParse(123).success).toBe(true);
      expect(JsonValueSchema.safeParse(true).success).toBe(true);
      expect(JsonValueSchema.safeParse(null).success).toBe(true);
    });

    it('accepts empty array', () => {
      expect(JsonValueSchema.safeParse([]).success).toBe(true);
    });

    it('accepts array of primitives', () => {
      expect(JsonValueSchema.safeParse([1, 'two', true, null]).success).toBe(true);
    });

    it('accepts nested arrays', () => {
      expect(
        JsonValueSchema.safeParse([
          [1, 2],
          [3, 4],
        ]).success
      ).toBe(true);
    });

    it('accepts empty object', () => {
      expect(JsonValueSchema.safeParse({}).success).toBe(true);
    });

    it('accepts object with primitives', () => {
      const obj = { name: 'test', count: 42, active: true, data: null };
      expect(JsonValueSchema.safeParse(obj).success).toBe(true);
    });

    it('accepts deeply nested structure', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, { nested: true }],
            },
          },
        },
      };
      expect(JsonValueSchema.safeParse(deep).success).toBe(true);
    });

    it('accepts mixed array and object nesting', () => {
      const mixed = {
        items: [
          { id: 1, tags: ['a', 'b'] },
          { id: 2, tags: ['c'] },
        ],
        metadata: { count: 2 },
      };
      expect(JsonValueSchema.safeParse(mixed).success).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('rejects undefined', () => {
      const result = JsonValueSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('rejects NaN', () => {
      const result = JsonValueSchema.safeParse(NaN);
      expect(result.success).toBe(false);
    });

    it('rejects Infinity', () => {
      const result = JsonValueSchema.safeParse(Infinity);
      expect(result.success).toBe(false);
    });

    it('rejects -Infinity', () => {
      const result = JsonValueSchema.safeParse(-Infinity);
      expect(result.success).toBe(false);
    });

    it('rejects BigInt', () => {
      const result = JsonValueSchema.safeParse(BigInt(123));
      expect(result.success).toBe(false);
    });

    it('rejects Date', () => {
      const result = JsonValueSchema.safeParse(new Date());
      expect(result.success).toBe(false);
    });

    it('rejects function', () => {
      const result = JsonValueSchema.safeParse(() => {});
      expect(result.success).toBe(false);
    });

    it('rejects Symbol', () => {
      const result = JsonValueSchema.safeParse(Symbol('test'));
      expect(result.success).toBe(false);
    });

    it('rejects Map', () => {
      const result = JsonValueSchema.safeParse(new Map());
      expect(result.success).toBe(false);
    });

    it('rejects Set', () => {
      const result = JsonValueSchema.safeParse(new Set());
      expect(result.success).toBe(false);
    });

    it('rejects array with undefined', () => {
      const result = JsonValueSchema.safeParse([1, undefined, 3]);
      expect(result.success).toBe(false);
    });

    it('rejects array with NaN', () => {
      const result = JsonValueSchema.safeParse([1, NaN, 3]);
      expect(result.success).toBe(false);
    });

    it('rejects object with undefined value', () => {
      const result = JsonValueSchema.safeParse({ a: 1, b: undefined });
      expect(result.success).toBe(false);
    });

    it('rejects object with NaN value', () => {
      const result = JsonValueSchema.safeParse({ a: 1, b: NaN });
      expect(result.success).toBe(false);
    });

    it('rejects nested object with Date', () => {
      const result = JsonValueSchema.safeParse({
        outer: {
          inner: new Date(),
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects class instance', () => {
      class CustomClass {
        value = 42;
      }
      const result = JsonValueSchema.safeParse(new CustomClass());
      expect(result.success).toBe(false);
    });

    it('rejects RegExp', () => {
      const result = JsonValueSchema.safeParse(/test/);
      expect(result.success).toBe(false);
    });
  });

  describe('error reporting', () => {
    it('rejects nested invalid value and reports error', () => {
      const result = JsonValueSchema.safeParse({
        valid: 'ok',
        nested: {
          bad: NaN,
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have at least one issue about the invalid value
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('rejects array with invalid element and reports error', () => {
      const result = JsonValueSchema.safeParse([1, 2, NaN, 4]);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have at least one issue about the invalid value
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('JsonObjectSchema', () => {
  describe('valid objects', () => {
    it('accepts empty object', () => {
      expect(JsonObjectSchema.safeParse({}).success).toBe(true);
    });

    it('accepts object with primitives', () => {
      expect(JsonObjectSchema.safeParse({ a: 1, b: 'two' }).success).toBe(true);
    });

    it('accepts nested object', () => {
      expect(JsonObjectSchema.safeParse({ a: { b: { c: 1 } } }).success).toBe(true);
    });
  });

  describe('rejects non-plain objects', () => {
    it('rejects Date', () => {
      const result = JsonObjectSchema.safeParse(new Date());
      expect(result.success).toBe(false);
    });

    it('rejects Map', () => {
      const result = JsonObjectSchema.safeParse(new Map());
      expect(result.success).toBe(false);
    });

    it('rejects Set', () => {
      const result = JsonObjectSchema.safeParse(new Set());
      expect(result.success).toBe(false);
    });

    it('rejects class instance', () => {
      class Foo {
        x = 1;
      }
      const result = JsonObjectSchema.safeParse(new Foo());
      expect(result.success).toBe(false);
    });

    it('rejects array (not an object)', () => {
      const result = JsonObjectSchema.safeParse([1, 2, 3]);
      expect(result.success).toBe(false);
    });
  });
});

describe('JsonArraySchema', () => {
  describe('valid arrays', () => {
    it('accepts empty array', () => {
      expect(JsonArraySchema.safeParse([]).success).toBe(true);
    });

    it('accepts array of primitives', () => {
      expect(JsonArraySchema.safeParse([1, 'a', true, null]).success).toBe(true);
    });

    it('accepts array of objects', () => {
      expect(JsonArraySchema.safeParse([{ a: 1 }, { b: 2 }]).success).toBe(true);
    });

    it('accepts nested arrays', () => {
      expect(JsonArraySchema.safeParse([[1], [2, 3]]).success).toBe(true);
    });
  });

  describe('invalid arrays', () => {
    it('rejects array with undefined', () => {
      const result = JsonArraySchema.safeParse([1, undefined]);
      expect(result.success).toBe(false);
    });

    it('rejects array with NaN', () => {
      const result = JsonArraySchema.safeParse([NaN]);
      expect(result.success).toBe(false);
    });
  });
});

describe('JSON roundtrip tests', () => {
  describe('adapter evidence fixtures', () => {
    it('rails-stripe: checkout session', () => {
      const evidence = {
        checkout_session_id: 'cs_test_abc123',
        payment_intent: 'pi_xyz789',
        customer: 'cus_456',
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('rails-x402: invoice with payTo', () => {
      const evidence = {
        invoice_id: 'inv_abc',
        dialect: 'v2',
        network_label: 'Base',
        pay_to: {
          mode: 'callback',
          callback_url: 'https://example.com/callback',
        },
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('rails-razorpay: UPI with hashed VPA', () => {
      const evidence = {
        payment_id: 'pay_abc123',
        status: 'captured',
        method: 'upi',
        vpa_hash: 'a1b2c3d4e5f6',
        order_id: 'order_xyz',
        acquirer_data: {
          rrn: '123456789012',
        },
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('rails-card: billing snapshot with entitlements', () => {
      const evidence = {
        billing_snapshot: {
          provider: 'stripe',
          customer_external_id: 'cust_abc',
          plan_slug: 'pro',
          entitlements: [
            { feature: 'api_calls', limit: 10000 },
            { feature: 'storage', limit: null },
          ],
          captured_at: '2024-01-01T00:00:00Z',
        },
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('mappings-acp: checkout event', () => {
      const evidence = {
        checkout_id: 'chk_abc123',
        customer_id: 'cust_xyz',
        acp_metadata: {
          source: 'agent',
          session: 'sess_123',
        },
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('x402-daydreams: inference event', () => {
      const evidence = {
        event_id: 'evt_abc',
        model_id: 'gpt-4',
        provider: 'openai',
        profile: 'PEIP-AI/inference@1',
        tokens_in: 100,
        tokens_out: 50,
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('x402-fluora: MCP call', () => {
      const evidence = {
        call_id: 'call_abc',
        tool_name: 'web_search',
        mcp_server: 'fluora-mcp',
        duration_ms: 1234,
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('x402-pinata: IPFS gateway', () => {
      const evidence = {
        gateway: 'pinata',
        cid: 'QmXyz123',
        size_bytes: 1024000,
        content_type: 'image/png',
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });
  });

  describe('edge cases', () => {
    it('handles empty evidence (common default)', () => {
      const evidence = {};
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('handles deeply nested valid structure', () => {
      const evidence = {
        a: { b: { c: { d: { e: { f: 'deep' } } } } },
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('handles large array', () => {
      const evidence = {
        items: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item_${i}` })),
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });

    it('handles unicode strings', () => {
      const evidence = {
        message: 'Hello',
        symbols: 'alpha beta gamma',
        cjk: 'Chinese Japanese Korean',
      };
      expect(JsonValueSchema.safeParse(evidence).success).toBe(true);
      expect(assertJsonRoundtrip(evidence)).toEqual(evidence);
    });
  });
});

describe('regression tests', () => {
  it('undefined values in objects are rejected (not silently dropped)', () => {
    // This is critical: JSON.stringify drops undefined values silently
    // We want to catch this at validation time, not after serialization
    const result = JsonValueSchema.safeParse({ a: 1, b: undefined, c: 3 });
    expect(result.success).toBe(false);
  });

  it('Date objects are rejected even when empty', () => {
    // Date has no enumerable properties, could slip through z.record()
    const result = JsonObjectSchema.safeParse(new Date());
    expect(result.success).toBe(false);
  });

  it('Map objects are rejected even when empty', () => {
    // Map has no enumerable properties
    const result = JsonObjectSchema.safeParse(new Map());
    expect(result.success).toBe(false);
  });

  it('class instances are rejected even with only primitive properties', () => {
    class Simple {
      x = 1;
      y = 'two';
    }
    const result = JsonObjectSchema.safeParse(new Simple());
    expect(result.success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Iterative JSON Safety Validator Tests (v0.9.21+)
// -----------------------------------------------------------------------------

describe('assertJsonSafeIterative', () => {
  describe('valid JSON values', () => {
    it('accepts null', () => {
      expect(assertJsonSafeIterative(null)).toEqual({ ok: true });
    });

    it('accepts string', () => {
      expect(assertJsonSafeIterative('hello')).toEqual({ ok: true });
    });

    it('accepts number', () => {
      expect(assertJsonSafeIterative(42)).toEqual({ ok: true });
    });

    it('accepts boolean', () => {
      expect(assertJsonSafeIterative(true)).toEqual({ ok: true });
    });

    it('accepts empty object', () => {
      expect(assertJsonSafeIterative({})).toEqual({ ok: true });
    });

    it('accepts empty array', () => {
      expect(assertJsonSafeIterative([])).toEqual({ ok: true });
    });

    it('accepts nested structure within limits', () => {
      const nested = { a: { b: { c: [1, 2, { d: 'deep' }] } } };
      expect(assertJsonSafeIterative(nested)).toEqual({ ok: true });
    });
  });

  describe('invalid JSON values', () => {
    it('rejects undefined', () => {
      const result = assertJsonSafeIterative(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('undefined');
      }
    });

    it('rejects NaN', () => {
      const result = assertJsonSafeIterative(NaN);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-finite');
      }
    });

    it('rejects Infinity', () => {
      const result = assertJsonSafeIterative(Infinity);
      expect(result.ok).toBe(false);
    });

    it('rejects -Infinity', () => {
      const result = assertJsonSafeIterative(-Infinity);
      expect(result.ok).toBe(false);
    });

    it('rejects BigInt', () => {
      const result = assertJsonSafeIterative(BigInt(123));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('BigInt');
      }
    });

    it('rejects function', () => {
      const result = assertJsonSafeIterative(() => {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Function');
      }
    });

    it('rejects Symbol', () => {
      const result = assertJsonSafeIterative(Symbol('test'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Symbol');
      }
    });

    it('rejects Date', () => {
      const result = assertJsonSafeIterative(new Date());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-plain object');
        expect(result.error).toContain('Date');
      }
    });

    it('rejects Map', () => {
      const result = assertJsonSafeIterative(new Map());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Map');
      }
    });

    it('rejects Set', () => {
      const result = assertJsonSafeIterative(new Set());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Set');
      }
    });

    it('rejects class instance', () => {
      class CustomClass {
        value = 42;
      }
      const result = assertJsonSafeIterative(new CustomClass());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Non-plain object');
        expect(result.error).toContain('CustomClass');
      }
    });
  });

  describe('cycle detection', () => {
    it('rejects direct self-reference', () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('rejects indirect cycle (A -> B -> A)', () => {
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      a.child = b;
      b.parent = a;
      const result = assertJsonSafeIterative(a);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('rejects cycle in array', () => {
      const arr: unknown[] = [1, 2];
      arr.push(arr);
      const result = assertJsonSafeIterative(arr);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });

    it('rejects deep cycle', () => {
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      const c: Record<string, unknown> = {};
      a.b = b;
      b.c = c;
      c.a = a;
      const result = assertJsonSafeIterative(a);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });
  });

  describe('DoS caps - depth limit', () => {
    it('accepts structure at max depth', () => {
      // Build nested object at exactly maxDepth (32)
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 31; i++) {
        obj = { nested: obj };
      }
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(true);
    });

    it('rejects structure exceeding max depth', () => {
      // Build nested object beyond maxDepth
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 35; i++) {
        obj = { nested: obj };
      }
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum depth exceeded');
        expect(result.error).toContain('32');
      }
    });

    it('respects custom depth limit', () => {
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 10; i++) {
        obj = { nested: obj };
      }
      const result = assertJsonSafeIterative(obj, { maxDepth: 5 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum depth exceeded');
      }
    });

    it('does not stack overflow on extremely deep nesting (10k depth)', () => {
      // This test proves the iterative approach prevents stack overflow
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 10_000; i++) {
        obj = { nested: obj };
      }
      // Should fail fast with depth error, NOT throw stack overflow
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum depth exceeded');
      }
    });
  });

  describe('DoS caps - array length limit', () => {
    it('accepts array at max length', () => {
      const arr = Array.from({ length: JSON_EVIDENCE_LIMITS.maxArrayLength }, (_, i) => i);
      const result = assertJsonSafeIterative(arr);
      expect(result.ok).toBe(true);
    });

    it('rejects array exceeding max length', () => {
      const arr = Array.from({ length: JSON_EVIDENCE_LIMITS.maxArrayLength + 1 }, (_, i) => i);
      const result = assertJsonSafeIterative(arr);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Array exceeds maximum length');
      }
    });

    it('respects custom array length limit', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = assertJsonSafeIterative(arr, { maxArrayLength: 5 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Array exceeds maximum length');
      }
    });
  });

  describe('DoS caps - object keys limit', () => {
    it('accepts object at max key count', () => {
      const obj: Record<string, number> = {};
      for (let i = 0; i < JSON_EVIDENCE_LIMITS.maxObjectKeys; i++) {
        obj[`key${i}`] = i;
      }
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(true);
    });

    it('rejects object exceeding max key count', () => {
      const obj: Record<string, number> = {};
      for (let i = 0; i < JSON_EVIDENCE_LIMITS.maxObjectKeys + 1; i++) {
        obj[`key${i}`] = i;
      }
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Object exceeds maximum key count');
      }
    });

    it('respects custom object keys limit', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      const result = assertJsonSafeIterative(obj, { maxObjectKeys: 3 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Object exceeds maximum key count');
      }
    });
  });

  describe('DoS caps - string length limit', () => {
    it('accepts string at max length', () => {
      const str = 'x'.repeat(JSON_EVIDENCE_LIMITS.maxStringLength);
      const result = assertJsonSafeIterative(str);
      expect(result.ok).toBe(true);
    });

    it('rejects string exceeding max length', () => {
      const str = 'x'.repeat(JSON_EVIDENCE_LIMITS.maxStringLength + 1);
      const result = assertJsonSafeIterative(str);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('String exceeds maximum length');
      }
    });

    it('respects custom string length limit', () => {
      const result = assertJsonSafeIterative('hello world', { maxStringLength: 5 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('String exceeds maximum length');
      }
    });
  });

  describe('DoS caps - total nodes limit', () => {
    it('accepts structure at max total nodes', () => {
      // Create structure with exactly maxTotalNodes nodes (100k by default)
      // Using a smaller limit for test performance
      const arr = Array.from({ length: 99 }, (_, i) => i);
      const result = assertJsonSafeIterative(arr, { maxTotalNodes: 100 });
      expect(result.ok).toBe(true);
    });

    it('rejects structure exceeding max total nodes', () => {
      // Create wide structure that exceeds node limit
      const arr = Array.from({ length: 101 }, (_, i) => i);
      const result = assertJsonSafeIterative(arr, { maxTotalNodes: 100 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum total nodes exceeded');
        expect(result.error).toContain('100');
      }
    });

    it('respects custom total nodes limit', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      // obj counts as 1 + 5 = 6 nodes
      const result = assertJsonSafeIterative(obj, { maxTotalNodes: 5 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum total nodes exceeded');
      }
    });

    it('counts all nodes including primitives', () => {
      // { a: [1, 2, 3] } = 1 (root) + 1 (array) + 3 (numbers) = 5 nodes
      const obj = { a: [1, 2, 3] };
      const result = assertJsonSafeIterative(obj, { maxTotalNodes: 4 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum total nodes exceeded');
      }
    });

    it('prevents wide DoS attack that bypasses per-container limits', () => {
      // Create 100 objects each with 900 keys (under 1000 limit)
      // Total nodes would be 100 * 900 = 90,000 (under 100k default)
      // But with maxTotalNodes=1000, it fails fast
      const wideStructure: Record<string, number>[] = [];
      for (let i = 0; i < 10; i++) {
        const obj: Record<string, number> = {};
        for (let j = 0; j < 200; j++) {
          obj[`key${j}`] = j;
        }
        wideStructure.push(obj);
      }
      // This has 1 (root) + 10 (array elements) + 10*200 (object values) = 2011 nodes
      const result = assertJsonSafeIterative(wideStructure, { maxTotalNodes: 1000 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Maximum total nodes exceeded');
      }
    });
  });

  describe('error paths', () => {
    it('reports correct path for nested invalid value', () => {
      const obj = { a: { b: { c: NaN } } };
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.path).toEqual(['a', 'b', 'c']);
      }
    });

    it('reports correct path for invalid array element', () => {
      const arr = [1, 2, [3, undefined]];
      const result = assertJsonSafeIterative(arr);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.path).toEqual([2, 1]);
      }
    });

    it('reports path for cycle', () => {
      const obj: Record<string, unknown> = { a: { b: {} } };
      (obj.a as Record<string, unknown>).b = { cycle: obj.a };
      const result = assertJsonSafeIterative(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Cycle detected');
      }
    });
  });
});

describe('validateEvidence', () => {
  describe('valid evidence', () => {
    it('returns ok for valid payment evidence', () => {
      const evidence = {
        txId: 'tx_123',
        amount: 100,
        status: 'captured',
      };
      const result = validateEvidence(evidence);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual(evidence);
      }
    });

    it('returns ok for empty evidence', () => {
      const result = validateEvidence({});
      expect(result.ok).toBe(true);
    });
  });

  describe('invalid evidence', () => {
    it('returns error for NaN in evidence', () => {
      const evidence = { amount: NaN };
      const result = validateEvidence(evidence);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
      }
    });

    it('returns error for cycle in evidence', () => {
      const evidence: Record<string, unknown> = { txId: 'tx_123' };
      evidence.self = evidence;
      const result = validateEvidence(evidence);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
        expect(result.error.remediation).toContain('JSON-safe');
      }
    });

    it('returns error with path for deep invalid value', () => {
      const evidence = {
        payment: {
          details: {
            amount: Infinity,
          },
        },
      };
      const result = validateEvidence(evidence);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
        expect(result.error.pointer).toBe('/payment/details/amount');
      }
    });

    it('returns error for evidence exceeding depth limit', () => {
      let obj: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 50; i++) {
        obj = { nested: obj };
      }
      const result = validateEvidence(obj);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_EVIDENCE_NOT_JSON');
      }
    });
  });
});
