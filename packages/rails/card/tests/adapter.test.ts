import { describe, it, expect } from 'vitest';
import {
  buildCardRailId,
  toPaymentEvidence,
  validateBillingSnapshot,
  type CardBillingEvent,
  type BillingSnapshot,
} from '../src/index.js';

describe('card rail adapter', () => {
  describe('buildCardRailId', () => {
    it('should build rail ID with processor', () => {
      expect(buildCardRailId('flowglad', 'stripe')).toBe('card.stripe.flowglad');
      expect(buildCardRailId('stripe', 'stripe')).toBe('card.stripe.stripe');
    });

    it('should use default processor for providers', () => {
      expect(buildCardRailId('flowglad')).toBe('card.stripe.flowglad');
      expect(buildCardRailId('stripe')).toBe('card.stripe.direct');
      expect(buildCardRailId('lago')).toBe('card.lago');
    });
  });

  describe('toPaymentEvidence', () => {
    const billingSnapshot: BillingSnapshot = {
      provider: 'flowglad',
      customerExternalId: 'cust_123',
      planSlug: 'pro_plan',
      entitlements: [
        { feature: 'api_calls', limit: 10000 },
        { feature: 'storage', limit: null },
      ],
      capturedAt: '2025-01-01T00:00:00Z',
      subscriptionId: 'sub_abc',
      invoiceId: 'inv_xyz',
    };

    const event: CardBillingEvent = {
      eventId: 'evt_123',
      eventType: 'charge.succeeded',
      payload: {},
      billingSnapshot,
      amountMinorUnits: 2999,
      currency: 'USD',
      env: 'live',
    };

    it('should convert event to PaymentEvidence', () => {
      const evidence = toPaymentEvidence(event);

      expect(evidence.rail).toBe('card.stripe.flowglad');
      expect(evidence.reference).toBe('evt_123');
      expect(evidence.amount).toBe(2999);
      expect(evidence.currency).toBe('USD');
      expect(evidence.asset).toBe('USD');
      expect(evidence.env).toBe('live');
    });

    it('should include billing_snapshot in evidence', () => {
      const evidence = toPaymentEvidence(event);

      expect(evidence.evidence).toBeDefined();
      const snapshot = (evidence.evidence as Record<string, unknown>).billing_snapshot as Record<
        string,
        unknown
      >;
      expect(snapshot.provider).toBe('flowglad');
      expect(snapshot.customer_external_id).toBe('cust_123');
      expect(snapshot.plan_slug).toBe('pro_plan');
      expect(snapshot.captured_at).toBe('2025-01-01T00:00:00Z');
      expect(snapshot.subscription_id).toBe('sub_abc');
      expect(snapshot.invoice_id).toBe('inv_xyz');
    });

    it('should map entitlements correctly', () => {
      const evidence = toPaymentEvidence(event);
      const snapshot = (evidence.evidence as Record<string, unknown>).billing_snapshot as Record<
        string,
        unknown
      >;
      const entitlements = snapshot.entitlements as Array<Record<string, unknown>>;

      expect(entitlements).toHaveLength(2);
      expect(entitlements[0].feature).toBe('api_calls');
      expect(entitlements[0].limit).toBe(10000);
      expect(entitlements[1].feature).toBe('storage');
      expect(entitlements[1].limit).toBeNull();
    });

    it('should use custom processor', () => {
      const evidence = toPaymentEvidence(event, 'adyen');
      expect(evidence.rail).toBe('card.adyen.flowglad');
    });
  });

  describe('validateBillingSnapshot', () => {
    const validSnapshot: BillingSnapshot = {
      provider: 'stripe',
      customerExternalId: 'cust_123',
      planSlug: 'pro',
      entitlements: [],
      capturedAt: '2025-01-01T00:00:00Z',
    };

    it('should return no errors for valid snapshot', () => {
      const errors = validateBillingSnapshot(validSnapshot);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing provider', () => {
      const snapshot = { ...validSnapshot, provider: '' as BillingSnapshot['provider'] };
      const errors = validateBillingSnapshot(snapshot);
      expect(errors).toContain('provider is required');
    });

    it('should detect missing customerExternalId', () => {
      const snapshot = { ...validSnapshot, customerExternalId: '' };
      const errors = validateBillingSnapshot(snapshot);
      expect(errors).toContain('customerExternalId is required');
    });

    it('should detect missing planSlug', () => {
      const snapshot = { ...validSnapshot, planSlug: '' };
      const errors = validateBillingSnapshot(snapshot);
      expect(errors).toContain('planSlug is required');
    });

    it('should detect missing capturedAt', () => {
      const snapshot = { ...validSnapshot, capturedAt: '' };
      const errors = validateBillingSnapshot(snapshot);
      expect(errors).toContain('capturedAt is required');
    });

    it('should detect invalid entitlements type', () => {
      const snapshot = { ...validSnapshot, entitlements: 'invalid' as unknown as [] };
      const errors = validateBillingSnapshot(snapshot);
      expect(errors).toContain('entitlements must be an array');
    });
  });
});
