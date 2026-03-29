import { describe, it, expect } from 'vitest';
import { detectX402Version, detectX402VersionFromSource } from '../src/version.js';

describe('detectX402Version', () => {
  describe('V2 detection via PAYMENT-REQUIRED (402 challenge)', () => {
    it('detects V2 from payment-required header', () => {
      const result = detectX402Version({
        'payment-required': 'eyJ4NDAyVmVyc2lvbiI6Mn0=',
      });
      expect(result.version).toBe(2);
      expect(result.confident).toBe(true);
    });
  });

  describe('V2 detection via PAYMENT-SIGNATURE (client proof)', () => {
    it('detects V2 from payment-signature header', () => {
      const result = detectX402Version({
        'payment-signature': 'eyJ4NDAyVmVyc2lvbiI6Mn0=',
      });
      expect(result.version).toBe(2);
      expect(result.confident).toBe(true);
    });
  });

  describe('V2 detection via PAYMENT-RESPONSE (settlement)', () => {
    it('detects V2 from payment-response header', () => {
      const result = detectX402Version({
        'payment-response': 'eyJzdWNjZXNzIjp0cnVlfQ==',
      });
      expect(result.version).toBe(2);
      expect(result.confident).toBe(true);
    });
  });

  describe('V1 detection via X-PAYMENT-RESPONSE', () => {
    it('detects V1 from x-payment-response header', () => {
      const result = detectX402Version({
        'x-payment-response': '{"format":"jws","signature":"eyJ..."}',
      });
      expect(result.version).toBe(1);
      expect(result.confident).toBe(true);
    });
  });

  describe('V1 detection via X-PAYMENT', () => {
    it('detects V1 from x-payment header', () => {
      const result = detectX402Version({
        'x-payment': '{"format":"jws","signature":"eyJ..."}',
      });
      expect(result.version).toBe(1);
      expect(result.confident).toBe(true);
    });
  });

  describe('mixed V1+V2 headers resolve to V2', () => {
    it('resolves to V2 when both payment-response and x-payment-response present', () => {
      const result = detectX402Version({
        'payment-response': 'eyJzdWNjZXNzIjp0cnVlfQ==',
        'x-payment-response': '{"format":"jws","signature":"eyJ..."}',
      });
      expect(result.version).toBe(2);
      expect(result.confident).toBe(true);
    });
  });

  describe('no x402 headers', () => {
    it('defaults to V1 with low confidence', () => {
      const result = detectX402Version({
        'content-type': 'application/json',
      });
      expect(result.version).toBe(1);
      expect(result.confident).toBe(false);
    });

    it('returns reason for ambiguity', () => {
      const result = detectX402Version({});
      expect(result.confident).toBe(false);
      if (!result.confident) {
        expect(result.reason).toBe('no x402 headers found');
      }
    });
  });

  describe('PEAC receipt alongside x402 headers', () => {
    it('V2 detected when PEAC-Receipt + payment-response both present', () => {
      const result = detectX402Version({
        'peac-receipt': 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.sig',
        'payment-response': 'eyJzdWNjZXNzIjp0cnVlfQ==',
      });
      expect(result.version).toBe(2);
      expect(result.confident).toBe(true);
    });

    it('V1 detected when PEAC-Receipt + x-payment-response both present', () => {
      const result = detectX402Version({
        'peac-receipt': 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.sig',
        'x-payment-response': '{"format":"jws"}',
      });
      expect(result.version).toBe(1);
      expect(result.confident).toBe(true);
    });
  });
});

describe('detectX402VersionFromSource', () => {
  it('returns V2 confident for x402_v2 source', () => {
    const result = detectX402VersionFromSource('x402_v2');
    expect(result.version).toBe(2);
    expect(result.confident).toBe(true);
  });

  it('returns V1 confident for x402_v1 source', () => {
    const result = detectX402VersionFromSource('x402_v1');
    expect(result.version).toBe(1);
    expect(result.confident).toBe(true);
  });

  it('returns V1 not confident for peac source', () => {
    const result = detectX402VersionFromSource('peac');
    expect(result.version).toBe(1);
    expect(result.confident).toBe(false);
  });
});
