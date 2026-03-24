/**
 * Tests for paymentauth OpenAPI discovery extraction.
 */

import { describe, it, expect } from 'vitest';
import { extractServiceInfo, extractPaymentInfo } from '../src/index.js';

describe('extractServiceInfo', () => {
  it('should extract x-service-info from OpenAPI doc', () => {
    const doc = {
      openapi: '3.0.0',
      'x-service-info': {
        categories: ['ai', 'data'],
        docs: {
          apiReference: 'https://api.example.com/docs',
          homepage: 'https://example.com',
          llms: 'https://example.com/llms.txt',
        },
      },
    };

    const result = extractServiceInfo(doc);

    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(['ai', 'data']);
    expect(result!.docs?.apiReference).toBe('https://api.example.com/docs');
    expect(result!.docs?.homepage).toBe('https://example.com');
    expect(result!.docs?.llms).toBe('https://example.com/llms.txt');
  });

  it('should return null when x-service-info absent', () => {
    expect(extractServiceInfo({ openapi: '3.0.0' })).toBeNull();
  });

  it('should return null for non-object input', () => {
    expect(extractServiceInfo(null)).toBeNull();
    expect(extractServiceInfo('string')).toBeNull();
    expect(extractServiceInfo(42)).toBeNull();
  });

  it('should handle partial docs object', () => {
    const doc = {
      'x-service-info': {
        docs: { homepage: 'https://example.com' },
      },
    };

    const result = extractServiceInfo(doc);
    expect(result!.docs?.homepage).toBe('https://example.com');
    expect(result!.docs?.apiReference).toBeUndefined();
  });

  it('should filter non-string categories', () => {
    const doc = {
      'x-service-info': {
        categories: ['valid', 42, null, 'also-valid'],
      },
    };

    const result = extractServiceInfo(doc);
    expect(result!.categories).toEqual(['valid', 'also-valid']);
  });
});

describe('extractPaymentInfo', () => {
  it('should extract x-payment-info from operation', () => {
    const op = {
      'x-payment-info': {
        intent: 'charge',
        method: 'stripe',
        amount: '1000',
        currency: 'usd',
        description: 'API access',
      },
    };

    const result = extractPaymentInfo(op);

    expect(result).not.toBeNull();
    expect(result!.intent).toBe('charge');
    expect(result!.method).toBe('stripe');
    expect(result!.amount).toBe('1000');
    expect(result!.currency).toBe('usd');
    expect(result!.description).toBe('API access');
  });

  it('should handle null amount (dynamic pricing)', () => {
    const op = {
      'x-payment-info': {
        intent: 'charge',
        method: 'stripe',
        amount: null,
        currency: 'usd',
      },
    };

    const result = extractPaymentInfo(op);
    expect(result!.amount).toBeNull();
  });

  it('should return null when x-payment-info absent', () => {
    expect(extractPaymentInfo({ get: {} })).toBeNull();
  });

  it('should return null for non-object input', () => {
    expect(extractPaymentInfo(null)).toBeNull();
  });
});
