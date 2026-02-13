/**
 * Conformance vector runner for stripe-crypto fixtures
 *
 * Executes vectors from specs/conformance/fixtures/stripe-crypto/
 * against the actual fromCryptoPaymentIntent() implementation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fromCryptoPaymentIntent, type StripeCryptoPaymentIntent } from '../src/index';

const FIXTURES_DIR = join(__dirname, '..', '..', '..', '..', 'specs', 'conformance', 'fixtures', 'stripe-crypto');

interface ValidVector {
  id: string;
  description: string;
  category: 'valid';
  input: {
    intent: StripeCryptoPaymentIntent;
    env?: 'live' | 'test';
  };
  expected: Record<string, unknown>;
  notes: string;
}

interface InvalidVector {
  id: string;
  description: string;
  category: 'invalid';
  cases: Array<{
    id: string;
    input: { intent: Record<string, unknown> };
    expected_error: string;
  }>;
  notes: string;
}

function loadVector<T>(filename: string): T {
  const raw = readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

describe('stripe-crypto conformance vectors', () => {
  describe('valid vectors', () => {
    const minimal = loadVector<ValidVector>('minimal-crypto-intent.json');
    const full = loadVector<ValidVector>('full-crypto-intent.json');

    it(`${minimal.id}: ${minimal.description}`, () => {
      const result = fromCryptoPaymentIntent(minimal.input.intent, minimal.input.env);

      expect(result.rail).toBe(minimal.expected.rail);
      expect(result.reference).toBe(minimal.expected.reference);
      expect(result.amount).toBe(minimal.expected.amount);
      expect(result.currency).toBe(minimal.expected.currency);
      expect(result.asset).toBe(minimal.expected.asset);
      expect(result.network).toBe(minimal.expected.network);
      expect(result.env).toBe(minimal.expected.env);
      expect(result.evidence).toMatchObject(minimal.expected.evidence as Record<string, unknown>);
    });

    it(`${full.id}: ${full.description}`, () => {
      const result = fromCryptoPaymentIntent(full.input.intent, full.input.env);

      expect(result.rail).toBe(full.expected.rail);
      expect(result.reference).toBe(full.expected.reference);
      expect(result.amount).toBe(full.expected.amount);
      expect(result.currency).toBe(full.expected.currency);
      expect(result.asset).toBe(full.expected.asset);
      expect(result.network).toBe(full.expected.network);
      expect(result.env).toBe(full.expected.env);
      expect(result.evidence).toMatchObject(full.expected.evidence as Record<string, unknown>);
    });
  });

  describe('invalid vectors', () => {
    const invalid = loadVector<InvalidVector>('missing-required-fields.json');

    for (const testCase of invalid.cases) {
      it(`${testCase.id}: must throw containing "${testCase.expected_error}"`, () => {
        expect(() =>
          fromCryptoPaymentIntent(testCase.input.intent as unknown as StripeCryptoPaymentIntent)
        ).toThrow(testCase.expected_error);
      });
    }
  });
});
