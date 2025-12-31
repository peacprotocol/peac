/**
 * @peac/telemetry-otel - Privacy filter tests
 */

import { describe, it, expect } from 'vitest';
import { createPrivacyFilter, hashIssuer, hashKid, shouldEmitAttribute } from '../src/privacy.js';

describe('hashIssuer', () => {
  it('should hash issuer with salt', () => {
    const issuer = 'https://api.example.com';
    const hashed = hashIssuer(issuer, 'test-salt');

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(issuer);
    expect(hashed?.length).toBe(64); // SHA256 hex
  });

  it('should return undefined for undefined issuer', () => {
    expect(hashIssuer(undefined)).toBeUndefined();
  });

  it('should produce consistent hashes', () => {
    const issuer = 'https://api.example.com';
    const hash1 = hashIssuer(issuer, 'test-salt');
    const hash2 = hashIssuer(issuer, 'test-salt');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes with different salts', () => {
    const issuer = 'https://api.example.com';
    const hash1 = hashIssuer(issuer, 'salt-1');
    const hash2 = hashIssuer(issuer, 'salt-2');

    expect(hash1).not.toBe(hash2);
  });
});

describe('hashKid', () => {
  it('should hash kid with salt', () => {
    const kid = '2025-01-01T00:00:00Z';
    const hashed = hashKid(kid, 'test-salt');

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(kid);
    expect(hashed?.length).toBe(64);
  });

  it('should return undefined for undefined kid', () => {
    expect(hashKid(undefined)).toBeUndefined();
  });
});

describe('createPrivacyFilter', () => {
  describe('strict mode', () => {
    const filter = createPrivacyFilter({
      serviceName: 'test',
      privacyMode: 'strict',
      hashSalt: 'test-salt',
    });

    it('should always emit core attributes', () => {
      const { attributes } = filter({
        'peac.version': '0.9.22',
        'peac.event': 'peac.receipt.issued',
        'peac.receipt.hash': 'sha256:abc123',
      });

      expect(attributes['peac.version']).toBe('0.9.22');
      expect(attributes['peac.event']).toBe('peac.receipt.issued');
      expect(attributes['peac.receipt.hash']).toBe('sha256:abc123');
    });

    it('should hash issuer in strict mode', () => {
      const { attributes } = filter({
        'peac.issuer': 'https://api.example.com',
      });

      expect(attributes['peac.issuer']).not.toBe('https://api.example.com');
      expect(attributes['peac.issuer']).toHaveLength(64);
    });

    it('should redact payment attributes in strict mode', () => {
      const { attributes, redactedCount } = filter({
        'peac.payment.rail': 'stripe',
        'peac.payment.amount': 500,
        'peac.payment.currency': 'USD',
      });

      expect(attributes['peac.payment.rail']).toBeUndefined();
      expect(attributes['peac.payment.amount']).toBeUndefined();
      expect(attributes['peac.payment.currency']).toBeUndefined();
      expect(redactedCount).toBe(3);
    });

    it('should skip null/undefined values', () => {
      const { attributes } = filter({
        'peac.version': '0.9.22',
        'peac.issuer': null,
        'peac.kid': undefined,
      });

      expect(attributes['peac.version']).toBe('0.9.22');
      expect('peac.issuer' in attributes).toBe(false);
      expect('peac.kid' in attributes).toBe(false);
    });
  });

  describe('balanced mode', () => {
    const filter = createPrivacyFilter({
      serviceName: 'test',
      privacyMode: 'balanced',
      hashSalt: 'test-salt',
    });

    it('should hash issuer in balanced mode', () => {
      const { attributes } = filter({
        'peac.issuer': 'https://api.example.com',
      });

      expect(attributes['peac.issuer']).toHaveLength(64);
    });

    it('should emit payment attributes in balanced mode', () => {
      const { attributes, redactedCount } = filter({
        'peac.payment.rail': 'stripe',
        'peac.payment.amount': 500,
        'peac.payment.currency': 'USD',
      });

      expect(attributes['peac.payment.rail']).toBe('stripe');
      expect(attributes['peac.payment.amount']).toBe(500);
      expect(attributes['peac.payment.currency']).toBe('USD');
      expect(redactedCount).toBe(0);
    });
  });

  describe('custom mode', () => {
    const filter = createPrivacyFilter({
      serviceName: 'test',
      privacyMode: 'custom',
      allowAttributes: ['custom.allowed', 'peac.payment.rail'],
      hashSalt: 'test-salt',
    });

    it('should emit allowlisted attributes', () => {
      const { attributes } = filter({
        'custom.allowed': 'value',
        'peac.payment.rail': 'stripe',
      });

      expect(attributes['custom.allowed']).toBe('value');
      expect(attributes['peac.payment.rail']).toBe('stripe');
    });

    it('should redact non-allowlisted attributes', () => {
      const { attributes, redactedCount } = filter({
        'custom.not_allowed': 'value',
      });

      expect(attributes['custom.not_allowed']).toBeUndefined();
      expect(redactedCount).toBe(1);
    });

    it('should hash issuer even if not allowlisted', () => {
      const { attributes } = filter({
        'peac.issuer': 'https://api.example.com',
      });

      expect(attributes['peac.issuer']).toHaveLength(64);
    });
  });

  describe('custom redaction hook', () => {
    it('should apply custom redaction', () => {
      const filter = createPrivacyFilter({
        serviceName: 'test',
        privacyMode: 'balanced',
        redact: (attrs) => {
          return {
            ...attrs,
            custom_added: 'by-hook',
          };
        },
      });

      const { attributes } = filter({
        'peac.version': '0.9.22',
      });

      expect(attributes['peac.version']).toBe('0.9.22');
      expect(attributes['custom_added']).toBe('by-hook');
    });
  });
});

describe('shouldEmitAttribute', () => {
  it('should always emit core attributes in any mode', () => {
    expect(shouldEmitAttribute('peac.version', 'strict')).toBe(true);
    expect(shouldEmitAttribute('peac.receipt.hash', 'strict')).toBe(true);
    expect(shouldEmitAttribute('peac.decision', 'balanced')).toBe(true);
    expect(shouldEmitAttribute('http.request.method', 'custom')).toBe(true);
  });

  it('should emit issuer in all modes (hashed in strict)', () => {
    expect(shouldEmitAttribute('peac.issuer', 'strict')).toBe(true);
    expect(shouldEmitAttribute('peac.issuer', 'balanced')).toBe(true);
  });

  it('should not emit payment in strict mode', () => {
    expect(shouldEmitAttribute('peac.payment.rail', 'strict')).toBe(false);
    expect(shouldEmitAttribute('peac.payment.amount', 'strict')).toBe(false);
  });

  it('should emit payment in balanced mode', () => {
    expect(shouldEmitAttribute('peac.payment.rail', 'balanced')).toBe(true);
    expect(shouldEmitAttribute('peac.payment.amount', 'balanced')).toBe(true);
  });

  it('should use allowlist in custom mode', () => {
    const allowList = new Set(['custom.attr']);
    expect(shouldEmitAttribute('custom.attr', 'custom', allowList)).toBe(true);
    expect(shouldEmitAttribute('other.attr', 'custom', allowList)).toBe(false);
  });
});
