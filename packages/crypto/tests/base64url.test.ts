/**
 * Tests for Base64url encoding/decoding (RFC 4648 §5)
 */

import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  base64urlDecode,
  base64urlEncodeString,
  base64urlDecodeString,
} from '../src/base64url';

describe('Base64url encoding', () => {
  it('should encode bytes to base64url', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = base64urlEncode(bytes);

    expect(encoded).toBe('SGVsbG8');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('should decode base64url to bytes', () => {
    const encoded = 'SGVsbG8';
    const decoded = base64urlDecode(encoded);

    expect(Array.from(decoded)).toEqual([72, 101, 108, 108, 111]);
  });

  it('should handle base64url without padding', () => {
    // Test various padding scenarios
    const tests = [
      { str: 'YQ', expected: [97] }, // "a" - needs 2 padding chars
      { str: 'YWI', expected: [97, 98] }, // "ab" - needs 1 padding char
      { str: 'YWJj', expected: [97, 98, 99] }, // "abc" - no padding needed
    ];

    tests.forEach(({ str, expected }) => {
      const decoded = base64urlDecode(str);
      expect(Array.from(decoded)).toEqual(expected);
    });
  });

  it('should replace + with - and / with _', () => {
    // Test case that would produce + or / in standard base64
    const bytes = new Uint8Array([0xfb, 0xff]); // Would be +// in base64
    const encoded = base64urlEncode(bytes);

    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).toContain('-'); // - is used instead of +
    expect(encoded).toContain('_'); // _ is used instead of /
  });

  it('should encode and decode strings', () => {
    const str = 'Hello, World! 🌍';
    const encoded = base64urlEncodeString(str);
    const decoded = base64urlDecodeString(encoded);

    expect(decoded).toBe(str);
  });

  it('should handle empty input', () => {
    const emptyBytes = new Uint8Array([]);
    const encoded = base64urlEncode(emptyBytes);

    expect(encoded).toBe('');

    const decoded = base64urlDecode('');
    expect(decoded.length).toBe(0);
  });

  it('should handle UTF-8 strings correctly', () => {
    const tests = [
      'hello',
      'Hello, World!',
      'symbols: @#$%^&*()',
      'multi-byte: 你好世界',
      '{"typ":"peac.receipt/0.9"}',
    ];

    tests.forEach((str) => {
      const encoded = base64urlEncodeString(str);
      const decoded = base64urlDecodeString(encoded);
      expect(decoded).toBe(str);
    });
  });

  it('should round-trip encode/decode', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);
    const encoded = base64urlEncode(original);
    const decoded = base64urlDecode(encoded);

    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('should encode JSON object', () => {
    const obj = { typ: 'peac.receipt/0.9', alg: 'EdDSA', kid: '2025-01-15T10:30:00Z' };
    const json = JSON.stringify(obj);
    const encoded = base64urlEncodeString(json);

    // Should be valid base64url (no +, /, or =)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);

    // Should decode back to original
    const decoded = base64urlDecodeString(encoded);
    expect(JSON.parse(decoded)).toEqual(obj);
  });
});
