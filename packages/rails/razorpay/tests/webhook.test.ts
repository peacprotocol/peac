/**
 * Webhook signature verification tests
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature, isWebhookSignatureValid, RazorpayError } from '../src/index.js';

const TEST_SECRET = 'whsec_test_secret_key_12345';

/**
 * Helper to create a valid signature for a body
 */
function createValidSignature(body: Uint8Array, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const testBody = new TextEncoder().encode('{"event":"payment.captured"}');

  it('should verify valid signature', () => {
    const signature = createValidSignature(testBody, TEST_SECRET);
    expect(verifyWebhookSignature(testBody, signature, TEST_SECRET)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const invalidSignature = 'a'.repeat(64);
    expect(() => verifyWebhookSignature(testBody, invalidSignature, TEST_SECRET)).toThrow(
      RazorpayError
    );
    expect(() => verifyWebhookSignature(testBody, invalidSignature, TEST_SECRET)).toThrow(
      'Webhook signature verification failed'
    );
  });

  it('should reject empty signature header', () => {
    expect(() => verifyWebhookSignature(testBody, '', TEST_SECRET)).toThrow(RazorpayError);
    expect(() => verifyWebhookSignature(testBody, '', TEST_SECRET)).toThrow(
      'signature header is empty'
    );
  });

  it('should reject signature with non-hex characters', () => {
    const nonHexSignature = 'g'.repeat(64);
    expect(() => verifyWebhookSignature(testBody, nonHexSignature, TEST_SECRET)).toThrow(
      RazorpayError
    );
    expect(() => verifyWebhookSignature(testBody, nonHexSignature, TEST_SECRET)).toThrow(
      'non-hex characters'
    );
  });

  it('should reject signature with wrong length (too short)', () => {
    const shortSignature = 'ab12'.repeat(8); // 32 chars instead of 64
    expect(() => verifyWebhookSignature(testBody, shortSignature, TEST_SECRET)).toThrow(
      RazorpayError
    );
    expect(() => verifyWebhookSignature(testBody, shortSignature, TEST_SECRET)).toThrow(
      'incorrect length'
    );
  });

  it('should reject signature with wrong length (too long)', () => {
    const longSignature = 'ab12'.repeat(20); // 80 chars instead of 64
    expect(() => verifyWebhookSignature(testBody, longSignature, TEST_SECRET)).toThrow(
      RazorpayError
    );
    expect(() => verifyWebhookSignature(testBody, longSignature, TEST_SECRET)).toThrow(
      'incorrect length'
    );
  });

  it('should handle whitespace in signature header', () => {
    const signature = createValidSignature(testBody, TEST_SECRET);
    const signatureWithWhitespace = `  ${signature}  `;
    expect(verifyWebhookSignature(testBody, signatureWithWhitespace, TEST_SECRET)).toBe(true);
  });

  it('should work with different body content', () => {
    const body1 = new TextEncoder().encode('{"id":"pay_123"}');
    const body2 = new TextEncoder().encode('{"id":"pay_456"}');

    const sig1 = createValidSignature(body1, TEST_SECRET);
    const sig2 = createValidSignature(body2, TEST_SECRET);

    expect(verifyWebhookSignature(body1, sig1, TEST_SECRET)).toBe(true);
    expect(verifyWebhookSignature(body2, sig2, TEST_SECRET)).toBe(true);

    // Cross-check: wrong body for signature should fail
    expect(() => verifyWebhookSignature(body1, sig2, TEST_SECRET)).toThrow('verification failed');
  });

  it('should reject signature computed with wrong secret', () => {
    const wrongSecret = 'wrong_secret';
    const wrongSignature = createValidSignature(testBody, wrongSecret);
    expect(() => verifyWebhookSignature(testBody, wrongSignature, TEST_SECRET)).toThrow(
      'verification failed'
    );
  });

  it('should be case-insensitive for hex signature', () => {
    const signature = createValidSignature(testBody, TEST_SECRET);
    const upperCaseSignature = signature.toUpperCase();
    expect(verifyWebhookSignature(testBody, upperCaseSignature, TEST_SECRET)).toBe(true);
  });
});

describe('isWebhookSignatureValid', () => {
  const testBody = new TextEncoder().encode('{"event":"test"}');

  it('should return true for valid signature', () => {
    const signature = createValidSignature(testBody, TEST_SECRET);
    expect(isWebhookSignatureValid(testBody, signature, TEST_SECRET)).toBe(true);
  });

  it('should return false for invalid signature (no throw)', () => {
    expect(isWebhookSignatureValid(testBody, 'invalid', TEST_SECRET)).toBe(false);
  });

  it('should return false for empty signature (no throw)', () => {
    expect(isWebhookSignatureValid(testBody, '', TEST_SECRET)).toBe(false);
  });

  it('should return false for wrong length signature (no throw)', () => {
    expect(isWebhookSignatureValid(testBody, 'abc123', TEST_SECRET)).toBe(false);
  });
});

describe('signature preconditions', () => {
  const testBody = new TextEncoder().encode('test');

  it('should check length before timingSafeEqual', () => {
    // This test ensures we don't call timingSafeEqual with different length buffers
    // which would throw. Instead, we should throw our own error.
    const shortSignature = 'ab'.repeat(16); // 32 chars
    expect(() => verifyWebhookSignature(testBody, shortSignature, TEST_SECRET)).toThrow(
      'incorrect length'
    );
  });
});
