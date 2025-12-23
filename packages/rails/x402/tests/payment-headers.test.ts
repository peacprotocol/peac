/**
 * Tests for x402 payment headers (headers-only API)
 *
 * Coverage:
 * - PAYMENT-REQUIRED detection
 * - Payment reference extraction
 * - PAYMENT-RESPONSE extraction
 * - Case-insensitive header lookup
 * - Type constraints (HeadersLike, no Response)
 */

import { describe, it, expect } from 'vitest';
import {
  detectPaymentRequired,
  extractPaymentReference,
  extractPaymentResponse,
  type HeadersLike,
} from '../src/payment-headers';

// Helper: Create a simple HeadersLike implementation
function createHeaders(entries: Record<string, string>): HeadersLike {
  return {
    get(name: string): string | null {
      return entries[name] ?? null;
    },
  };
}

// Helper: Create a case-insensitive HeadersLike (like native Headers)
function createCaseInsensitiveHeaders(entries: Record<string, string>): HeadersLike {
  const lowerCaseMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    lowerCaseMap[key.toLowerCase()] = value;
  }
  return {
    get(name: string): string | null {
      return lowerCaseMap[name.toLowerCase()] ?? null;
    },
  };
}

describe('x402 payment headers - detectPaymentRequired', () => {
  it('should detect PAYMENT-REQUIRED header when present', () => {
    const headers = createHeaders({
      'payment-required': 'ln:invoice123',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
  });

  it('should return false when PAYMENT-REQUIRED header is absent', () => {
    const headers = createHeaders({
      'content-type': 'application/json',
    });

    expect(detectPaymentRequired(headers)).toBe(false);
  });

  it('should return false when PAYMENT-REQUIRED header is empty', () => {
    const headers = createHeaders({
      'payment-required': '',
    });

    expect(detectPaymentRequired(headers)).toBe(false);
  });

  it('should return false when PAYMENT-REQUIRED header is whitespace-only', () => {
    const headers = createHeaders({
      'payment-required': '   ',
    });

    expect(detectPaymentRequired(headers)).toBe(false);
  });

  it('should handle PAYMENT-REQUIRED with leading/trailing whitespace', () => {
    const headers = createHeaders({
      'payment-required': '  ln:invoice123  ',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
  });

  it('should be case-insensitive (lowercase)', () => {
    const headers = createCaseInsensitiveHeaders({
      'payment-required': 'ln:invoice123',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
  });

  it('should be case-insensitive (Title-Case)', () => {
    const headers = createCaseInsensitiveHeaders({
      'Payment-Required': 'ln:invoice123',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
  });

  it('should be case-insensitive (UPPERCASE)', () => {
    const headers = createCaseInsensitiveHeaders({
      'PAYMENT-REQUIRED': 'ln:invoice123',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
  });
});

describe('x402 payment headers - extractPaymentReference', () => {
  it('should extract payment reference from PAYMENT-REQUIRED header', () => {
    const headers = createHeaders({
      'payment-required': 'ln:invoice123',
    });

    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should return undefined when PAYMENT-REQUIRED header is absent', () => {
    const headers = createHeaders({
      'content-type': 'application/json',
    });

    expect(extractPaymentReference(headers)).toBeUndefined();
  });

  it('should return undefined when PAYMENT-REQUIRED header is empty', () => {
    const headers = createHeaders({
      'payment-required': '',
    });

    expect(extractPaymentReference(headers)).toBeUndefined();
  });

  it('should return undefined when PAYMENT-REQUIRED header is whitespace-only', () => {
    const headers = createHeaders({
      'payment-required': '   ',
    });

    expect(extractPaymentReference(headers)).toBeUndefined();
  });

  it('should trim whitespace from payment reference', () => {
    const headers = createHeaders({
      'payment-required': '  ln:invoice123  ',
    });

    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should handle complex payment reference values', () => {
    const headers = createHeaders({
      'payment-required': 'eip155:8453:0x1234567890123456789012345678901234567890:inv_abc123',
    });

    expect(extractPaymentReference(headers)).toBe(
      'eip155:8453:0x1234567890123456789012345678901234567890:inv_abc123'
    );
  });

  it('should be case-insensitive (lowercase)', () => {
    const headers = createCaseInsensitiveHeaders({
      'payment-required': 'ln:invoice123',
    });

    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should be case-insensitive (Title-Case)', () => {
    const headers = createCaseInsensitiveHeaders({
      'Payment-Required': 'ln:invoice123',
    });

    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should be case-insensitive (UPPERCASE)', () => {
    const headers = createCaseInsensitiveHeaders({
      'PAYMENT-REQUIRED': 'ln:invoice123',
    });

    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });
});

describe('x402 payment headers - extractPaymentResponse', () => {
  it('should extract payment response from PAYMENT-RESPONSE header', () => {
    const headers = createHeaders({
      'payment-response': 'success:tx_abc123',
    });

    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should return undefined when PAYMENT-RESPONSE header is absent', () => {
    const headers = createHeaders({
      'content-type': 'application/json',
    });

    expect(extractPaymentResponse(headers)).toBeUndefined();
  });

  it('should return undefined when PAYMENT-RESPONSE header is empty', () => {
    const headers = createHeaders({
      'payment-response': '',
    });

    expect(extractPaymentResponse(headers)).toBeUndefined();
  });

  it('should return undefined when PAYMENT-RESPONSE header is whitespace-only', () => {
    const headers = createHeaders({
      'payment-response': '   ',
    });

    expect(extractPaymentResponse(headers)).toBeUndefined();
  });

  it('should trim whitespace from payment response', () => {
    const headers = createHeaders({
      'payment-response': '  success:tx_abc123  ',
    });

    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should be case-insensitive (lowercase)', () => {
    const headers = createCaseInsensitiveHeaders({
      'payment-response': 'success:tx_abc123',
    });

    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should be case-insensitive (Title-Case)', () => {
    const headers = createCaseInsensitiveHeaders({
      'Payment-Response': 'success:tx_abc123',
    });

    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should be case-insensitive (UPPERCASE)', () => {
    const headers = createCaseInsensitiveHeaders({
      'PAYMENT-RESPONSE': 'success:tx_abc123',
    });

    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });
});

describe('x402 payment headers - type constraints', () => {
  it('should accept HeadersLike interface', () => {
    const headers: HeadersLike = {
      get: (name: string) => (name === 'payment-required' ? 'ln:invoice123' : null),
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should work with native Headers (simulated)', () => {
    const headers = createCaseInsensitiveHeaders({
      'Payment-Required': 'ln:invoice123',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should NOT require Response object (type constraint test)', () => {
    // This test verifies that the API does NOT require Response
    // If this compiles, it means the API is headers-only as required

    const headersOnly: HeadersLike = createHeaders({
      'payment-required': 'ln:invoice123',
    });

    // All functions accept HeadersLike, NOT Response
    const detected = detectPaymentRequired(headersOnly);
    const reference = extractPaymentReference(headersOnly);
    const response = extractPaymentResponse(headersOnly);

    expect(detected).toBe(true);
    expect(reference).toBe('ln:invoice123');
    expect(response).toBeUndefined();
  });
});

describe('x402 payment headers - no body access', () => {
  it('should not access request/response body anywhere', () => {
    // Verify that our API surface does NOT include any body-parsing logic
    // This is a structural test - if the types accept HeadersLike only,
    // then body access is impossible at the type level

    const headers = createHeaders({
      'payment-required': 'ln:invoice123',
      'payment-response': 'success:tx_abc123',
    });

    // All extractions work with headers only
    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');

    // No body parameter exists in any function signature
    // This test passes if the above calls compile without body access
  });
});

describe('x402 payment headers - plain object support (Node/Express)', () => {
  it('should accept plain object headers (lowercase keys)', () => {
    // Node.js/Express lowercases all header names
    const headers = {
      'content-type': 'application/json',
      'payment-required': 'ln:invoice123',
      'payment-response': 'success:tx_abc123',
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should accept plain object headers (mixed case keys)', () => {
    const headers = {
      'Payment-Required': 'ln:invoice123',
      'Payment-Response': 'success:tx_abc123',
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should accept plain object headers (uppercase keys)', () => {
    const headers = {
      'PAYMENT-REQUIRED': 'ln:invoice123',
      'PAYMENT-RESPONSE': 'success:tx_abc123',
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should handle array values (take first element)', () => {
    // HTTP allows multiple headers with same name, represented as arrays
    const headers = {
      'payment-required': ['ln:invoice123', 'ln:invoice456'],
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
  });

  it('should handle undefined values in plain object', () => {
    const headers: Record<string, string | undefined> = {
      'content-type': 'application/json',
      'payment-required': undefined,
    };

    expect(detectPaymentRequired(headers)).toBe(false);
    expect(extractPaymentReference(headers)).toBeUndefined();
  });

  it('should handle empty plain object', () => {
    const headers = {};

    expect(detectPaymentRequired(headers)).toBe(false);
    expect(extractPaymentReference(headers)).toBeUndefined();
    expect(extractPaymentResponse(headers)).toBeUndefined();
  });

  it('should work with simulated Express req.headers', () => {
    // Express/Node.js IncomingHttpHeaders style
    const headers: Record<string, string | string[] | undefined> = {
      host: 'example.com',
      'content-type': 'application/json',
      'payment-required': 'eip155:8453:0xabc:inv_123',
      'x-custom-header': ['value1', 'value2'],
    };

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('eip155:8453:0xabc:inv_123');
  });
});

describe('x402 payment headers - edge cases', () => {
  it('should handle multiple headers (only PAYMENT-REQUIRED checked)', () => {
    const headers = createHeaders({
      'content-type': 'application/json',
      'payment-required': 'ln:invoice123',
      'payment-response': 'success:tx_abc123',
      authorization: 'Bearer token',
    });

    expect(detectPaymentRequired(headers)).toBe(true);
    expect(extractPaymentReference(headers)).toBe('ln:invoice123');
    expect(extractPaymentResponse(headers)).toBe('success:tx_abc123');
  });

  it('should handle null header values gracefully', () => {
    const headers: HeadersLike = {
      get: () => null,
    };

    expect(detectPaymentRequired(headers)).toBe(false);
    expect(extractPaymentReference(headers)).toBeUndefined();
    expect(extractPaymentResponse(headers)).toBeUndefined();
  });

  it('should preserve exact value semantics (no parsing)', () => {
    // Payment reference should be returned as-is, no parsing/validation
    const reference = 'anything:goes:here:123:abc:xyz';
    const headers = createHeaders({
      'payment-required': reference,
    });

    expect(extractPaymentReference(headers)).toBe(reference);
  });
});
