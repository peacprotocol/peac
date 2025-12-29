import { describe, it, expect } from 'vitest';
import {
  parseFlowgladEvent,
  parseStripeInvoicePaid,
  parseLagoInvoice,
  type FlowgladChargeEvent,
  type StripeInvoicePaidEvent,
  type LagoInvoiceEvent,
} from '../src/index.js';

describe('card rail parsers', () => {
  describe('parseFlowgladEvent', () => {
    const validEvent: FlowgladChargeEvent = {
      id: 'evt_123',
      type: 'charge.succeeded',
      data: {
        chargeId: 'ch_123',
        amount: 2999,
        currency: 'usd',
        customerId: 'cust_abc',
        subscriptionId: 'sub_xyz',
        invoiceId: 'inv_456',
        planId: 'plan_pro',
        features: [
          { name: 'api_calls', limit: 10000 },
          { name: 'storage_gb', limit: 50 },
        ],
        livemode: true,
      },
    };

    it('should parse valid Flowglad event', () => {
      const result = parseFlowgladEvent(validEvent);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.eventId).toBe('evt_123');
      expect(result.value.amountMinorUnits).toBe(2999);
      expect(result.value.currency).toBe('USD');
      expect(result.value.env).toBe('live');
      expect(result.value.billingSnapshot.provider).toBe('flowglad');
      expect(result.value.billingSnapshot.customerExternalId).toBe('cust_abc');
      expect(result.value.billingSnapshot.planSlug).toBe('plan_pro');
      expect(result.value.billingSnapshot.entitlements).toHaveLength(2);
    });

    it('should reject invalid event type', () => {
      const invalidEvent = {
        ...validEvent,
        type: 'charge.failed',
      } as unknown as FlowgladChargeEvent;
      const result = parseFlowgladEvent(invalidEvent);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('UNKNOWN_EVENT');
    });

    it('should reject missing required fields', () => {
      const invalidEvent = {
        ...validEvent,
        data: { ...validEvent.data, customerId: '' },
      };
      const result = parseFlowgladEvent(invalidEvent);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('MISSING_FIELD');
    });

    it('should handle test mode', () => {
      const testEvent = {
        ...validEvent,
        data: { ...validEvent.data, livemode: false },
      };
      const result = parseFlowgladEvent(testEvent);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.env).toBe('test');
    });
  });

  describe('parseStripeInvoicePaid', () => {
    const validEvent: StripeInvoicePaidEvent = {
      id: 'evt_stripe_123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_abc',
          subscription: 'sub_xyz',
          amount_paid: 4999,
          currency: 'usd',
          lines: {
            data: [{ price: { product: 'prod_pro' } }, { price: { product: 'prod_addon' } }],
          },
        },
      },
      livemode: true,
    };

    it('should parse valid Stripe event', () => {
      const result = parseStripeInvoicePaid(validEvent);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.eventId).toBe('evt_stripe_123');
      expect(result.value.amountMinorUnits).toBe(4999);
      expect(result.value.currency).toBe('USD');
      expect(result.value.billingSnapshot.provider).toBe('stripe');
      expect(result.value.billingSnapshot.entitlements).toHaveLength(2);
    });

    it('should reject invalid event type', () => {
      const invalidEvent = {
        ...validEvent,
        type: 'invoice.created',
      } as unknown as StripeInvoicePaidEvent;
      const result = parseStripeInvoicePaid(invalidEvent);

      expect(result.ok).toBe(false);
    });

    it('should handle missing subscription', () => {
      const noSubEvent: StripeInvoicePaidEvent = {
        ...validEvent,
        data: {
          object: {
            ...validEvent.data.object,
            subscription: undefined,
          },
        },
      };
      const result = parseStripeInvoicePaid(noSubEvent);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.billingSnapshot.subscriptionId).toBeUndefined();
    });
  });

  describe('parseLagoInvoice', () => {
    const validEvent: LagoInvoiceEvent = {
      webhook_type: 'invoice.payment_status_updated',
      invoice: {
        lago_id: 'lago_inv_123',
        external_customer_id: 'ext_cust_abc',
        subscription_id: 'sub_xyz',
        amount_cents: 9999,
        currency: 'eur',
        status: 'succeeded',
        plan_code: 'enterprise',
        charges: [
          { billable_metric_code: 'api_requests', units: 50000 },
          { billable_metric_code: 'compute_hours', units: 100 },
        ],
      },
    };

    it('should parse valid Lago event', () => {
      const result = parseLagoInvoice(validEvent);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.eventId).toBe('lago_inv_123');
      expect(result.value.amountMinorUnits).toBe(9999);
      expect(result.value.currency).toBe('EUR');
      expect(result.value.billingSnapshot.provider).toBe('lago');
      expect(result.value.billingSnapshot.planSlug).toBe('enterprise');
      expect(result.value.billingSnapshot.entitlements).toHaveLength(2);
    });

    it('should reject non-succeeded status', () => {
      const failedEvent: LagoInvoiceEvent = {
        ...validEvent,
        invoice: { ...validEvent.invoice, status: 'failed' },
      };
      const result = parseLagoInvoice(failedEvent);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('UNKNOWN_EVENT');
    });

    it('should reject invalid webhook type', () => {
      const invalidEvent = {
        ...validEvent,
        webhook_type: 'invoice.created',
      } as unknown as LagoInvoiceEvent;
      const result = parseLagoInvoice(invalidEvent);

      expect(result.ok).toBe(false);
    });
  });
});
