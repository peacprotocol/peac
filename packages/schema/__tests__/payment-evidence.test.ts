/**
 * Tests for PaymentEvidence with aggregator and splits support
 */

import { describe, it, expect } from 'vitest';
import { PaymentSplitSchema, PaymentEvidenceSchema } from '../src/validators';

describe('PaymentSplitSchema', () => {
  describe('valid cases', () => {
    it('accepts split with amount only', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        amount: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('accepts split with share only', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'platform',
        share: 0.15,
      });
      expect(result.success).toBe(true);
    });

    it('accepts split with both amount and share', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'affiliate',
        amount: 500,
        share: 0.05,
      });
      expect(result.success).toBe(true);
    });

    it('accepts split with all optional fields', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        amount: 8000,
        currency: 'USD',
        share: 0.8,
        rail: 'x402',
        account_ref: 'acct_merchant_123',
        metadata: { order_id: 'ord_abc' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts share of 0 (edge case)', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'zero_share',
        share: 0,
      });
      expect(result.success).toBe(true);
    });

    it('accepts share of 1 (edge case)', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'full_share',
        share: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts amount of 0 (edge case)', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'zero_amount',
        amount: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid cases', () => {
    it('rejects split without party', () => {
      const result = PaymentSplitSchema.safeParse({
        amount: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects split with empty party', () => {
      const result = PaymentSplitSchema.safeParse({
        party: '',
        amount: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects split without amount or share', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'At least one of amount or share must be specified'
        );
      }
    });

    it('rejects negative amount', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        amount: -100,
      });
      expect(result.success).toBe(false);
    });

    it('rejects share below 0', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        share: -0.1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects share above 1', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        share: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid currency code', () => {
      const result = PaymentSplitSchema.safeParse({
        party: 'merchant',
        amount: 1000,
        currency: 'us', // lowercase, too short
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('PaymentEvidenceSchema', () => {
  const baseEvidence = {
    rail: 'x402',
    reference: 'pi_123456',
    amount: 10000,
    currency: 'USD',
    asset: 'USD',
    env: 'live' as const,
    evidence: { payment_intent: 'pi_123' },
  };

  describe('basic validation', () => {
    it('accepts valid payment evidence without aggregator/splits', () => {
      const result = PaymentEvidenceSchema.safeParse(baseEvidence);
      expect(result.success).toBe(true);
    });

    it('accepts payment evidence with network', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        network: 'lightning',
      });
      expect(result.success).toBe(true);
    });

    it('accepts payment evidence with facilitator_ref', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        facilitator_ref: 'acct_1234567890',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('aggregator support', () => {
    it('accepts payment evidence with aggregator', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        aggregator: 'marketplace_abc',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.aggregator).toBe('marketplace_abc');
      }
    });

    it('rejects empty aggregator string', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        aggregator: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('splits support', () => {
    it('accepts payment evidence with single split', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        splits: [{ party: 'merchant', amount: 10000 }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.splits).toHaveLength(1);
      }
    });

    it('accepts payment evidence with multiple splits', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        splits: [
          { party: 'merchant', share: 0.8 },
          { party: 'platform', share: 0.15 },
          { party: 'affiliate', share: 0.05 },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.splits).toHaveLength(3);
      }
    });

    it('accepts empty splits array', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        splits: [],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid split in array', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        splits: [
          { party: 'merchant', amount: 8000 },
          { party: 'invalid' }, // missing amount or share
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('aggregator + splits combined', () => {
    it('accepts full marketplace payment evidence', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        aggregator: 'marketplace_xyz',
        splits: [
          { party: 'merchant', amount: 8500, account_ref: 'acct_merch_001' },
          { party: 'platform', amount: 1000, account_ref: 'acct_platform' },
          { party: 'tax', amount: 500 },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.aggregator).toBe('marketplace_xyz');
        expect(result.data.splits).toHaveLength(3);
      }
    });
  });

  describe('required fields', () => {
    it('rejects missing rail', () => {
      const { rail: _, ...noRail } = baseEvidence;
      const result = PaymentEvidenceSchema.safeParse(noRail);
      expect(result.success).toBe(false);
    });

    it('rejects missing asset', () => {
      const { asset: _, ...noAsset } = baseEvidence;
      const result = PaymentEvidenceSchema.safeParse(noAsset);
      expect(result.success).toBe(false);
    });

    it('rejects missing env', () => {
      const { env: _, ...noEnv } = baseEvidence;
      const result = PaymentEvidenceSchema.safeParse(noEnv);
      expect(result.success).toBe(false);
    });

    it('rejects invalid env value', () => {
      const result = PaymentEvidenceSchema.safeParse({
        ...baseEvidence,
        env: 'staging', // not 'live' or 'test'
      });
      expect(result.success).toBe(false);
    });
  });
});
