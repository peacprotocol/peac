/**
 * Tests for parseReceiptClaims unified receipt parser
 *
 * Validates classification, schema enforcement, and exact error codes
 * using conformance vectors from specs/conformance/fixtures/.
 */

import { describe, it, expect } from 'vitest';
import { parseReceiptClaims } from '../src/receipt-parser.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const parseFixturesDir = path.resolve(__dirname, '../../../specs/conformance/fixtures/parse');

function loadFixture(name: string): unknown {
  const filePath = path.join(parseFixturesDir, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('parseReceiptClaims', () => {
  describe('input guard', () => {
    it('should reject null input', () => {
      const result = parseReceiptClaims(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
      }
    });

    it('should reject undefined input', () => {
      const result = parseReceiptClaims(undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
      }
    });

    it('should reject string input', () => {
      const result = parseReceiptClaims('not an object');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
      }
    });

    it('should reject array input', () => {
      const result = parseReceiptClaims([1, 2, 3]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
      }
    });

    it('should reject number input', () => {
      const result = parseReceiptClaims(42);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_INVALID_INPUT');
      }
    });
  });

  describe('valid commerce receipt', () => {
    it('should parse a valid commerce receipt', () => {
      const fixture = loadFixture('valid-commerce-receipt.json') as {
        claims: unknown;
        expected_variant: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe('commerce');
        expect(result.claims).toHaveProperty('amt', 1000);
        expect(result.claims).toHaveProperty('cur', 'USD');
        expect(result.claims).toHaveProperty('payment');
      }
    });
  });

  describe('valid attestation receipt', () => {
    it('should parse a valid attestation receipt', () => {
      const fixture = loadFixture('valid-attestation-receipt.json') as {
        claims: unknown;
        expected_variant: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe('attestation');
        expect(result.claims).not.toHaveProperty('amt');
        expect(result.claims).not.toHaveProperty('payment');
      }
    });
  });

  describe('invalid: partial commerce (amt only)', () => {
    it('should fail with E_PARSE_COMMERCE_INVALID when amt present but payment missing', () => {
      const fixture = loadFixture('invalid-partial-commerce-amt-only.json') as {
        claims: unknown;
        expected_error: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(fixture.expected_error);
        expect(result.error.code).toBe('E_PARSE_COMMERCE_INVALID');
      }
    });
  });

  describe('invalid: commerce wrong types', () => {
    it('should fail with E_PARSE_COMMERCE_INVALID when amt is string', () => {
      const fixture = loadFixture('invalid-commerce-wrong-types.json') as {
        claims: unknown;
        expected_error: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(fixture.expected_error);
        expect(result.error.code).toBe('E_PARSE_COMMERCE_INVALID');
      }
    });
  });

  describe('edge: attestation with accidental amt', () => {
    it('should classify as commerce and fail (not fall through to attestation)', () => {
      const fixture = loadFixture('edge-attestation-with-accidental-amt.json') as {
        claims: unknown;
        expected_error: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Must be classified as commerce (amt present), NOT attestation
        expect(result.error.code).toBe('E_PARSE_COMMERCE_INVALID');
        expect(result.error.code).not.toBe('E_PARSE_ATTESTATION_INVALID');
      }
    });
  });

  describe('edge: unknown top-level keys', () => {
    it('should reject extra keys under strict schema', () => {
      const fixture = loadFixture('edge-unknown-top-level-keys.json') as {
        claims: unknown;
        expected_error: string;
      };
      const result = parseReceiptClaims(fixture.claims);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(fixture.expected_error);
      }
    });
  });

  describe('classification by key presence', () => {
    it('should classify as commerce when only cur is present', () => {
      const result = parseReceiptClaims({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: 1735600000,
        rid: '019412e0-7b3a-7000-8000-000000000010',
        cur: 'USD',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_COMMERCE_INVALID');
      }
    });

    it('should classify as commerce when only payment is present', () => {
      const result = parseReceiptClaims({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: 1735600000,
        rid: '019412e0-7b3a-7000-8000-000000000011',
        payment: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('E_PARSE_COMMERCE_INVALID');
      }
    });

    it('should classify as attestation when no commerce keys present', () => {
      const result = parseReceiptClaims({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: 1735600000,
        exp: 1735603600,
        rid: '019412e0-7b3a-7000-8000-000000000012',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.variant).toBe('attestation');
      }
    });
  });

  describe('error details', () => {
    it('should include Zod issues in parse errors', () => {
      const result = parseReceiptClaims({
        iss: 'https://example.com',
        aud: 'https://api.example.com',
        iat: 1735600000,
        rid: '019412e0-7b3a-7000-8000-000000000013',
        amt: 'not a number',
        cur: 'USD',
        payment: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues!.length).toBeGreaterThan(0);
      }
    });
  });
});
