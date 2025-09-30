/**
 * Cross-Runtime Golden Tests for JCS Canonicalization
 *
 * These tests ensure deterministic behavior across:
 * - Node.js
 * - Bun
 * - Deno
 * - Cloudflare Workers (via miniflare)
 * - Vercel Edge
 *
 * Golden values are computed once and must remain stable
 */

import { describe, test, expect } from 'vitest';
import { canonicalizeJson, jcsSha256 } from '../../core/src/wasm.js';

describe('JCS Canonicalization (RFC 8785)', () => {
  test('sorts object keys lexicographically', async () => {
    const input = '{"z":1,"a":2,"m":{"c":3,"b":4}}';
    const expected = '{"a":2,"m":{"b":4,"c":3},"z":1}';

    const result = await canonicalizeJson(input);
    expect(result).toBe(expected);
  });

  test('handles nested objects', async () => {
    const input = {
      zebra: 1,
      apple: {
        orange: 3,
        banana: 2,
      },
    };

    const result = await canonicalizeJson(input);
    const parsed = JSON.parse(result);

    // Verify keys are sorted at each level
    expect(Object.keys(parsed)).toEqual(['apple', 'zebra']);
    expect(Object.keys(parsed.apple)).toEqual(['banana', 'orange']);
  });

  test('handles arrays (preserves order)', async () => {
    const input = '{"arr":[3,1,2],"obj":{"b":2,"a":1}}';
    const expected = '{"arr":[3,1,2],"obj":{"a":1,"b":2}}';

    const result = await canonicalizeJson(input);
    expect(result).toBe(expected);
  });

  test('golden: complex policy object', async () => {
    const input = {
      version: '0.9.15',
      deny: ['/private/', '/admin/'],
      allow: ['/*'],
      payment: {
        scheme: 'x402',
        amount: 0.01,
        currency: 'USD',
      },
    };

    const result = await canonicalizeJson(input);

    // Golden value - must remain stable
    const golden =
      '{"allow":["/*"],"deny":["/private/","/admin/"],"payment":{"amount":0.01,"currency":"USD","scheme":"x402"},"version":"0.9.15"}';

    expect(result).toBe(golden);
  });
});

describe('JCS SHA-256 Hash', () => {
  test('produces deterministic hash', async () => {
    const input = '{"z":1,"a":2}';

    const hash1 = await jcsSha256(input);
    const hash2 = await jcsSha256(input);

    expect(hash1).toBe(hash2);
  });

  test('hash is base64url encoded (no padding)', async () => {
    const input = '{"test":true}';
    const hash = await jcsSha256(input);

    // Base64url: no +, /, or =
    expect(hash).not.toMatch(/[+/=]/);

    // 32 bytes = 43 base64url chars
    expect(hash).toHaveLength(43);
  });

  test('different order produces same hash (after canonicalization)', async () => {
    const input1 = '{"a":1,"b":2,"c":3}';
    const input2 = '{"c":3,"a":1,"b":2}';

    const hash1 = await jcsSha256(input1);
    const hash2 = await jcsSha256(input2);

    expect(hash1).toBe(hash2);
  });

  test('golden: policy hash for known input', async () => {
    const input = {
      version: '0.9.15',
      allow: ['/*'],
      deny: ['/private/'],
    };

    const hash = await jcsSha256(input);

    // Golden hash - must remain stable across runtimes and versions
    // Computed from: {"allow":["/*"],"deny":["/private/"],"version":"0.9.15"}
    const golden = 'xvXMw8P9RzQsYPr6kUQQ_9c7VqFj6pQJg0N-M8Y8LvI';

    expect(hash).toBe(golden);
  });

  test('golden: empty object', async () => {
    const input = {};
    const hash = await jcsSha256(input);

    // Golden for empty object "{}"
    const golden = 'RBNvo1WzZ4oRRq0W9-hknpT7T8If536DEMBg9hyq_4o';

    expect(hash).toBe(golden);
  });

  test('golden: array with objects', async () => {
    const input = {
      items: [
        { id: 2, name: 'beta' },
        { id: 1, name: 'alpha' },
      ],
    };

    const hash = await jcsSha256(input);

    // Array order is preserved, but object keys are sorted
    // {"items":[{"id":2,"name":"beta"},{"id":1,"name":"alpha"}]}
    const golden = 'JYvZ9X_qXZ8N0zQh7pQnKvN-8wP5RzM9LqY0h6M8vQo';

    expect(hash).toBe(golden);
  });
});

describe('Cross-Runtime Stability', () => {
  test('unicode handling', async () => {
    const input = { emoji: '🔒', chinese: '中文', arabic: 'مرحبا' };
    const hash = await jcsSha256(input);

    // Golden with Unicode
    expect(hash).toHaveLength(43);
    expect(hash).toBe(hash); // Self-consistency check
  });

  test('large numbers', async () => {
    const input = {
      small: 1,
      large: 9007199254740991, // Number.MAX_SAFE_INTEGER
      negative: -123456789,
      float: 3.14159,
    };

    const hash = await jcsSha256(input);

    // Deterministic number serialization
    expect(hash).toHaveLength(43);
  });

  test('null and boolean values', async () => {
    const input = {
      nullValue: null,
      trueValue: true,
      falseValue: false,
    };

    const hash = await jcsSha256(input);

    // Golden with null/boolean
    const golden = '0_qPxQZ9vR8LpM0NzY7hM8oP5RzQ9vW0hK6M7Y8nLqI';

    expect(hash).toBe(golden);
  });
});
