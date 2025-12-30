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
} from '../src/json';

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
