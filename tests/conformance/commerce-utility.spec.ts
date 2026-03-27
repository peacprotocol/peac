/**
 * Commerce utility validation tests.
 *
 * Proves isValidAmountMinor() rejects invalid inputs rather than coercing
 * them, and that Stripe metadata policy precedence works through the public API.
 */

import { describe, it, expect } from 'vitest';
import { isValidAmountMinor } from '@peac/schema';
import { fromStripePaymentIntentObservation } from '@peac/rails-stripe';

// ---------------------------------------------------------------------------
// isValidAmountMinor: validate and reject, not coerce
// ---------------------------------------------------------------------------

describe('isValidAmountMinor(): validate and reject', () => {
  describe('valid inputs', () => {
    it('accepts positive integer string', () => {
      expect(isValidAmountMinor('1000')).toBe(true);
    });

    it('accepts zero', () => {
      expect(isValidAmountMinor('0')).toBe(true);
    });

    it('accepts negative integer string', () => {
      expect(isValidAmountMinor('-50')).toBe(true);
    });

    it('accepts large value within configured length limit', () => {
      expect(isValidAmountMinor('1'.repeat(64))).toBe(true);
    });

    it('accepts single digit', () => {
      expect(isValidAmountMinor('5')).toBe(true);
    });
  });

  describe('edge cases (documents current behavior)', () => {
    it('accepts leading zeros (current schema permits)', () => {
      expect(isValidAmountMinor('00100')).toBe(true);
    });
  });

  describe('invalid inputs (must reject, not coerce)', () => {
    it('rejects empty string', () => {
      expect(isValidAmountMinor('')).toBe(false);
    });

    it('rejects decimal string', () => {
      expect(isValidAmountMinor('10.50')).toBe(false);
    });

    it('rejects non-numeric string', () => {
      expect(isValidAmountMinor('abc')).toBe(false);
    });

    it('rejects numeric with spaces', () => {
      expect(isValidAmountMinor(' 100 ')).toBe(false);
    });

    it('rejects numeric with comma separators', () => {
      expect(isValidAmountMinor('1,000')).toBe(false);
    });

    it('rejects hex string', () => {
      expect(isValidAmountMinor('0xff')).toBe(false);
    });

    it('rejects scientific notation', () => {
      expect(isValidAmountMinor('1e5')).toBe(false);
    });

    it('rejects number type', () => {
      expect(isValidAmountMinor(1000)).toBe(false);
    });

    it('rejects null', () => {
      expect(isValidAmountMinor(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isValidAmountMinor(undefined)).toBe(false);
    });

    it('rejects boolean', () => {
      expect(isValidAmountMinor(true)).toBe(false);
    });

    it('rejects oversized string (exceeds configured length limit)', () => {
      expect(isValidAmountMinor('1'.repeat(65))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Stripe metadata policy: public API behavior
// ---------------------------------------------------------------------------

describe('Stripe metadata policy: public API behavior', () => {
  const baseObs = {
    payment_intent_id: 'pi_meta_test',
    status: 'succeeded' as const,
    amount: '1000',
    currency: 'usd',
    metadata: {
      order_id: 'ord_001',
      customer_email: 'user@example.com',
      internal_ref: 'secret_123',
    },
  };

  it('omit policy: metadata absent from evidence', () => {
    const result = fromStripePaymentIntentObservation(baseObs, {
      metadataPolicy: 'omit',
    });
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.metadata).toBeUndefined();
  });

  it('allowlist policy: only allowed keys present', () => {
    const result = fromStripePaymentIntentObservation(baseObs, {
      metadataPolicy: 'allowlist',
      metadataAllowedKeys: ['order_id'],
    });
    const ev = result.evidence as Record<string, unknown>;
    const metadata = ev.metadata as Record<string, unknown> | undefined;
    expect(metadata).toBeDefined();
    expect(metadata!.order_id).toBe('ord_001');
    expect(metadata!.customer_email).toBeUndefined();
    expect(metadata!.internal_ref).toBeUndefined();
  });

  it('default policy (no options): metadata omitted', () => {
    const result = fromStripePaymentIntentObservation(baseObs);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.metadata).toBeUndefined();
  });
});
