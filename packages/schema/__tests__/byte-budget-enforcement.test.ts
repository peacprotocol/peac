/**
 * Byte-budget enforcement tests (DD-173.4)
 *
 * Tests the actual enforcement path in validateKnownExtensions() via
 * Wire02ClaimsSchema.superRefine. Exercises per-group and total budget
 * limits using the normative measurement basis: UTF-8 byte length of
 * JSON.stringify output on plain JSON data.
 */

import { describe, it, expect } from 'vitest';
import { EXTENSION_BUDGET } from '@peac/kernel';
import { Wire02ClaimsSchema } from '../src/wire-02-envelope.js';
import { _isPlainJsonValue } from '../src/wire-02-extensions/validation.js';

/**
 * Build a minimal valid Wire 0.2 claims object for testing.
 * Extensions are injected via the extensions parameter.
 */
function makeClaimsWithExtensions(extensions: Record<string, unknown>) {
  return {
    peac_version: '0.2' as const,
    kind: 'evidence' as const,
    type: 'org.peacprotocol/payment',
    iss: 'https://example.com',
    iat: Math.floor(Date.now() / 1000),
    jti: 'test-jti-001',
    extensions,
  };
}

describe('byte-budget enforcement in Wire02ClaimsSchema', () => {
  it('accepts extensions within per-group budget', () => {
    const claims = makeClaimsWithExtensions({
      'org.peacprotocol/commerce': {
        payment_rail: 'stripe',
        amount_minor: '1000',
        currency: 'USD',
      },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(true);
  });

  it('rejects single extension group exceeding per-group budget', () => {
    // Create an extension group that exceeds 64 KB when serialized
    const hugeValue = 'x'.repeat(EXTENSION_BUDGET.maxGroupBytes + 1);
    const claims = makeClaimsWithExtensions({
      'com.example/huge': { data: hugeValue },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
    if (!result.success) {
      const sizeIssue = result.error.issues.find((i) => i.message === 'E_EXTENSION_SIZE_EXCEEDED');
      expect(sizeIssue).toBeDefined();
    }
  });

  it('rejects total extensions exceeding total budget', () => {
    // Create multiple groups that individually fit but together exceed 256 KB
    const groupSize = EXTENSION_BUDGET.maxGroupBytes - 100; // Just under per-group limit
    const groupCount = Math.ceil(EXTENSION_BUDGET.maxTotalBytes / groupSize) + 1;
    const extensions: Record<string, unknown> = {};
    for (let i = 0; i < groupCount; i++) {
      extensions[`com.example/group-${i}`] = { data: 'x'.repeat(groupSize) };
    }
    const claims = makeClaimsWithExtensions(extensions);
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
    if (!result.success) {
      const sizeIssue = result.error.issues.find((i) => i.message === 'E_EXTENSION_SIZE_EXCEEDED');
      expect(sizeIssue).toBeDefined();
    }
  });

  it('measures UTF-8 bytes, not JS string length', () => {
    // Multi-byte characters: one emoji is 4 UTF-8 bytes but 2 JS chars.
    // A string of emojis that fits in JS string length but exceeds byte budget
    // should be rejected.
    const encoder = new TextEncoder();
    const emoji = '\u{1F600}'; // 4 UTF-8 bytes per character

    // Build a value that is under 64 KB in JS string length but over in UTF-8 bytes
    const repeatCount = Math.ceil(EXTENSION_BUDGET.maxGroupBytes / 4) + 100;
    const emojiString = emoji.repeat(repeatCount);

    // Verify our assumption: JS length < byte length
    expect(emojiString.length).toBeLessThan(encoder.encode(JSON.stringify(emojiString)).byteLength);

    const claims = makeClaimsWithExtensions({
      'com.example/emoji': { data: emojiString },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
  });

  it('rejects top-level toJSON via canonical error code', () => {
    const claims = makeClaimsWithExtensions({
      'com.example/tojson': { toJSON: () => ({}) },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
    if (!result.success) {
      const guard = result.error.issues.find((i) => i.message === 'E_EXTENSION_NON_JSON_VALUE');
      expect(guard).toBeDefined();
    }
  });

  it('rejects nested Date inside plain object', () => {
    const claims = makeClaimsWithExtensions({
      'com.example/nested': { outer: { inner: new Date() } },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
    if (!result.success) {
      const guard = result.error.issues.find((i) => i.message === 'E_EXTENSION_NON_JSON_VALUE');
      expect(guard).toBeDefined();
    }
  });

  it('rejects nested BigInt inside array', () => {
    const claims = makeClaimsWithExtensions({
      'com.example/arr': { items: [1, 2, BigInt(3)] },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
  });

  it('rejects nested function inside array', () => {
    const claims = makeClaimsWithExtensions({
      'com.example/fn': { handlers: [() => {}] },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
  });

  it('rejects deeply nested non-JSON value', () => {
    const deep: Record<string, unknown> = { level: 0 };
    let current = deep;
    for (let i = 1; i < 10; i++) {
      const next: Record<string, unknown> = { level: i };
      current.child = next;
      current = next;
    }
    current.bad = new Map();
    const claims = makeClaimsWithExtensions({ 'com.example/deep': deep });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
  });

  it('rejects circular references via recursive guard', () => {
    const circular: Record<string, unknown> = { key: 'value' };
    circular.self = circular;
    const claims = makeClaimsWithExtensions({
      'com.example/circular': circular,
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
  });

  it('rejects undefined values nested in objects (undefined is not JSON)', () => {
    const claims = makeClaimsWithExtensions({
      'com.example/sparse': { present: 'yes', absent: undefined },
    });
    const result = Wire02ClaimsSchema.safeParse(claims);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The recursive guard correctly rejects undefined as non-JSON.
      // Even though JSON.stringify omits undefined, the protocol invariant
      // is "JSON values all the way down" and undefined is not a JSON value.
      const guard = result.error.issues.find((i) => i.message === 'E_EXTENSION_NON_JSON_VALUE');
      expect(guard).toBeDefined();
    }
  });
});

describe('isPlainJsonValue guard (recursive)', () => {
  // Primitives
  it('accepts null', () => expect(_isPlainJsonValue(null)).toBe(true));
  it('accepts string', () => expect(_isPlainJsonValue('hello')).toBe(true));
  it('accepts boolean', () => expect(_isPlainJsonValue(true)).toBe(true));
  it('accepts finite number', () => expect(_isPlainJsonValue(42)).toBe(true));
  it('accepts zero', () => expect(_isPlainJsonValue(0)).toBe(true));
  it('accepts negative', () => expect(_isPlainJsonValue(-1)).toBe(true));

  // Containers
  it('accepts plain object', () => expect(_isPlainJsonValue({ a: 1 })).toBe(true));
  it('accepts array', () => expect(_isPlainJsonValue([1, 2])).toBe(true));
  it('accepts Object.create(null)', () =>
    expect(_isPlainJsonValue(Object.create(null))).toBe(true));
  it('accepts nested plain objects', () =>
    expect(_isPlainJsonValue({ a: { b: { c: 'deep' } } })).toBe(true));
  it('accepts nested arrays', () => expect(_isPlainJsonValue([[1], [2, [3]]])).toBe(true));
  it('accepts mixed nested structures', () =>
    expect(_isPlainJsonValue({ a: [1, { b: 'x' }], c: null })).toBe(true));

  // Top-level rejections
  it('rejects function', () => expect(_isPlainJsonValue(() => {})).toBe(false));
  it('rejects Symbol', () => expect(_isPlainJsonValue(Symbol('x'))).toBe(false));
  it('rejects BigInt', () => expect(_isPlainJsonValue(BigInt(42))).toBe(false));
  it('rejects undefined', () => expect(_isPlainJsonValue(undefined)).toBe(false));
  it('rejects NaN', () => expect(_isPlainJsonValue(NaN)).toBe(false));
  it('rejects Infinity', () => expect(_isPlainJsonValue(Infinity)).toBe(false));
  it('rejects -Infinity', () => expect(_isPlainJsonValue(-Infinity)).toBe(false));
  it('rejects Date', () => expect(_isPlainJsonValue(new Date())).toBe(false));
  it('rejects RegExp', () => expect(_isPlainJsonValue(/abc/)).toBe(false));
  it('rejects Map', () => expect(_isPlainJsonValue(new Map())).toBe(false));
  it('rejects Set', () => expect(_isPlainJsonValue(new Set())).toBe(false));
  it('rejects object with toJSON', () =>
    expect(_isPlainJsonValue({ toJSON: () => ({}) })).toBe(false));

  // Nested rejections (recursive guard)
  it('rejects Date nested in object', () =>
    expect(_isPlainJsonValue({ a: { b: new Date() } })).toBe(false));
  it('rejects BigInt nested in array', () => expect(_isPlainJsonValue([1, BigInt(2)])).toBe(false));
  it('rejects function nested in array', () =>
    expect(_isPlainJsonValue([1, () => {}])).toBe(false));
  it('rejects NaN nested in object', () => expect(_isPlainJsonValue({ a: NaN })).toBe(false));
  it('rejects Infinity nested in object', () =>
    expect(_isPlainJsonValue({ a: Infinity })).toBe(false));
  it('rejects Map nested deeply', () =>
    expect(_isPlainJsonValue({ a: { b: { c: new Map() } } })).toBe(false));
  it('rejects toJSON nested in object', () =>
    expect(_isPlainJsonValue({ a: { toJSON: () => 'x' } })).toBe(false));

  // Circular reference detection
  it('rejects circular object reference', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(_isPlainJsonValue(obj)).toBe(false);
  });
  it('rejects circular array reference', () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    expect(_isPlainJsonValue(arr)).toBe(false);
  });

  // Shared-but-acyclic references (intentionally rejected: must be JSON tree)
  it('rejects shared-but-acyclic subobjects (extensions must be JSON trees)', () => {
    const shared = { x: 1 };
    expect(_isPlainJsonValue({ a: shared, b: shared })).toBe(false);
  });

  // Depth guard
  it('rejects pathologically deep structures (> 64 levels)', () => {
    let current: Record<string, unknown> = { leaf: 'value' };
    for (let i = 0; i < 70; i++) {
      current = { child: current };
    }
    expect(_isPlainJsonValue(current)).toBe(false);
  });
  it('accepts structures at exactly 64 levels', () => {
    let current: Record<string, unknown> = { leaf: 'value' };
    for (let i = 0; i < 62; i++) {
      // 62 wraps + 1 leaf + 1 top-level = 64 deep
      current = { child: current };
    }
    expect(_isPlainJsonValue(current)).toBe(true);
  });
});

describe('EXTENSION_BUDGET constants', () => {
  it('maxGroupBytes is 64 KB', () => {
    expect(EXTENSION_BUDGET.maxGroupBytes).toBe(65_536);
  });

  it('maxTotalBytes is 256 KB', () => {
    expect(EXTENSION_BUDGET.maxTotalBytes).toBe(262_144);
  });

  it('maxArrayPayloadBytes is 32 KB', () => {
    expect(EXTENSION_BUDGET.maxArrayPayloadBytes).toBe(32_768);
  });
});
