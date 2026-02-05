/**
 * Transport Profile Tests
 */

import { describe, it, expect } from 'vitest';
import {
  selectTransport,
  wrapResponse,
  buildResponseHeaders,
  buildReceiptResult,
} from '../src/transport.js';
import { HEADERS } from '@peac/kernel';

describe('selectTransport', () => {
  // Create a receipt of approximately known size
  const smallReceipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';
  const largeReceipt = 'x'.repeat(5000); // 5KB receipt

  describe('Default Behavior', () => {
    it('should default to header transport', () => {
      const transport = selectTransport(smallReceipt, {});
      expect(transport).toBe('header');
    });

    it('should use default maxHeaderSize (4096)', () => {
      // Just under 4096 bytes
      const justUnderLimit = 'x'.repeat(4000);
      const transport = selectTransport(justUnderLimit, {});
      expect(transport).toBe('header');
    });
  });

  describe('Header Transport', () => {
    it('should use header for small receipts', () => {
      const transport = selectTransport(smallReceipt, { transport: 'header' });
      expect(transport).toBe('header');
    });

    it('should fallback to body when receipt exceeds maxHeaderSize', () => {
      const transport = selectTransport(largeReceipt, {
        transport: 'header',
        maxHeaderSize: 4096,
      });
      expect(transport).toBe('body');
    });

    it('should respect custom maxHeaderSize', () => {
      const receipt = 'x'.repeat(1000);

      // Should fit in 2000 byte limit
      expect(selectTransport(receipt, { maxHeaderSize: 2000 })).toBe('header');

      // Should not fit in 500 byte limit
      expect(selectTransport(receipt, { maxHeaderSize: 500 })).toBe('body');
    });
  });

  describe('Body Transport', () => {
    it('should use body when explicitly configured', () => {
      const transport = selectTransport(smallReceipt, { transport: 'body' });
      expect(transport).toBe('body');
    });

    it('should use body regardless of receipt size', () => {
      const transport = selectTransport(largeReceipt, { transport: 'body' });
      expect(transport).toBe('body');
    });
  });

  describe('Pointer Transport', () => {
    it('should use pointer when explicitly configured', () => {
      const transport = selectTransport(smallReceipt, { transport: 'pointer' });
      expect(transport).toBe('pointer');
    });

    it('should use pointer regardless of receipt size', () => {
      const transport = selectTransport(largeReceipt, { transport: 'pointer' });
      expect(transport).toBe('pointer');
    });
  });

  describe('Size Calculation', () => {
    it('should correctly handle UTF-8 multi-byte characters', () => {
      // UTF-8 emoji is 4 bytes
      const unicodeReceipt = '\u{1F600}'.repeat(1000); // 4000 bytes
      const transport = selectTransport(unicodeReceipt, {
        transport: 'header',
        maxHeaderSize: 4096,
      });
      expect(transport).toBe('header');
    });

    it('should fallback for UTF-8 that exceeds limit', () => {
      const unicodeReceipt = '\u{1F600}'.repeat(1500); // 6000 bytes
      const transport = selectTransport(unicodeReceipt, {
        transport: 'header',
        maxHeaderSize: 4096,
      });
      expect(transport).toBe('body');
    });
  });
});

describe('wrapResponse', () => {
  const testReceipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

  it('should wrap object body', () => {
    const data = { items: [1, 2, 3] };
    const wrapped = wrapResponse(data, testReceipt);

    expect(wrapped).toEqual({
      data: { items: [1, 2, 3] },
      peac_receipt: testReceipt,
    });
  });

  it('should wrap array body', () => {
    const data = [1, 2, 3];
    const wrapped = wrapResponse(data, testReceipt);

    expect(wrapped).toEqual({
      data: [1, 2, 3],
      peac_receipt: testReceipt,
    });
  });

  it('should wrap primitive body', () => {
    const wrapped = wrapResponse('hello', testReceipt);

    expect(wrapped).toEqual({
      data: 'hello',
      peac_receipt: testReceipt,
    });
  });

  it('should wrap null body', () => {
    const wrapped = wrapResponse(null, testReceipt);

    expect(wrapped).toEqual({
      data: null,
      peac_receipt: testReceipt,
    });
  });

  it('should preserve type information', () => {
    interface MyData {
      id: number;
      name: string;
    }
    const data: MyData = { id: 1, name: 'test' };
    const wrapped = wrapResponse(data, testReceipt);

    // TypeScript should infer wrapped.data as MyData
    expect(wrapped.data.id).toBe(1);
    expect(wrapped.data.name).toBe('test');
  });
});

describe('buildResponseHeaders', () => {
  const testReceipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

  describe('Header Transport', () => {
    it('should add PEAC-Receipt header', async () => {
      const headers = await buildResponseHeaders(testReceipt, 'header');

      expect(headers).toEqual({
        [HEADERS.receipt]: testReceipt,
      });
    });
  });

  describe('Pointer Transport', () => {
    it('should add PEAC-Receipt-Pointer header using constant', async () => {
      const pointerUrl = 'https://receipts.example.com/abc123';
      const headers = await buildResponseHeaders(testReceipt, 'pointer', pointerUrl);

      // Should use HEADERS.receiptPointer constant
      expect(headers[HEADERS.receiptPointer]).toBeDefined();
      expect(headers[HEADERS.receiptPointer]).toContain('sha256="');
      expect(headers[HEADERS.receiptPointer]).toContain(`url="${pointerUrl}"`);
    });

    it('should compute correct SHA-256 digest', async () => {
      const pointerUrl = 'https://receipts.example.com/abc123';
      const headers = await buildResponseHeaders(testReceipt, 'pointer', pointerUrl);

      // Extract digest from header
      const match = headers[HEADERS.receiptPointer].match(/sha256="([^"]+)"/);
      expect(match).not.toBeNull();
      const digest = match![1];

      // Digest should be 64 hex characters
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw if pointerUrl is missing', async () => {
      await expect(buildResponseHeaders(testReceipt, 'pointer')).rejects.toThrow(
        'pointerUrl is required for pointer transport'
      );
    });

    describe('Pointer URL Validation', () => {
      it('should reject HTTP URLs (HTTPS only)', async () => {
        const httpUrl = 'http://receipts.example.com/abc123';
        await expect(buildResponseHeaders(testReceipt, 'pointer', httpUrl)).rejects.toThrow(
          'Pointer URL must use HTTPS'
        );
      });

      it('should reject URLs with quotes (header injection)', async () => {
        const quotedUrl = 'https://receipts.example.com/abc"123';
        await expect(buildResponseHeaders(testReceipt, 'pointer', quotedUrl)).rejects.toThrow(
          'Pointer URL contains invalid characters for structured header'
        );
      });

      it('should reject URLs with backslashes', async () => {
        const backslashUrl = 'https://receipts.example.com/abc\\123';
        await expect(buildResponseHeaders(testReceipt, 'pointer', backslashUrl)).rejects.toThrow(
          'Pointer URL contains invalid characters for structured header'
        );
      });

      it('should reject URLs with control characters', async () => {
        const controlCharUrl = 'https://receipts.example.com/abc\x00123';
        await expect(buildResponseHeaders(testReceipt, 'pointer', controlCharUrl)).rejects.toThrow(
          'Pointer URL contains control characters'
        );
      });

      it('should reject invalid URLs', async () => {
        const invalidUrl = 'not-a-url';
        await expect(buildResponseHeaders(testReceipt, 'pointer', invalidUrl)).rejects.toThrow(
          'Pointer URL is not a valid URL'
        );
      });

      it('should reject excessively long URLs', async () => {
        const longUrl = 'https://receipts.example.com/' + 'a'.repeat(2100);
        await expect(buildResponseHeaders(testReceipt, 'pointer', longUrl)).rejects.toThrow(
          'Pointer URL exceeds maximum length'
        );
      });
    });
  });

  describe('Body Transport', () => {
    it('should return empty headers', async () => {
      const headers = await buildResponseHeaders(testReceipt, 'body');
      expect(headers).toEqual({});
    });
  });
});

describe('buildReceiptResult', () => {
  const testReceipt = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.signature';

  describe('Header Transport', () => {
    it('should build result with headers only', async () => {
      const result = await buildReceiptResult({
        receipt: testReceipt,
        transport: 'header',
      });

      expect(result.receipt).toBe(testReceipt);
      expect(result.transport).toBe('header');
      expect(result.headers[HEADERS.receipt]).toBe(testReceipt);
      expect(result.bodyWrapper).toBeUndefined();
    });
  });

  describe('Body Transport', () => {
    it('should build result with body wrapper', async () => {
      const originalBody = { data: 'test' };
      const result = await buildReceiptResult({
        receipt: testReceipt,
        transport: 'body',
        originalBody,
      });

      expect(result.receipt).toBe(testReceipt);
      expect(result.transport).toBe('body');
      expect(result.headers).toEqual({});
      expect(result.bodyWrapper).toEqual({
        data: originalBody,
        peac_receipt: testReceipt,
      });
    });

    it('should not include bodyWrapper if originalBody is undefined', async () => {
      const result = await buildReceiptResult({
        receipt: testReceipt,
        transport: 'body',
      });

      expect(result.bodyWrapper).toBeUndefined();
    });
  });

  describe('Pointer Transport', () => {
    it('should build result with pointer header', async () => {
      const pointerUrl = 'https://receipts.example.com/abc123';
      const result = await buildReceiptResult({
        receipt: testReceipt,
        transport: 'pointer',
        pointerUrl,
      });

      expect(result.receipt).toBe(testReceipt);
      expect(result.transport).toBe('pointer');
      expect(result.headers[HEADERS.receiptPointer]).toBeDefined();
      expect(result.bodyWrapper).toBeUndefined();
    });
  });
});
