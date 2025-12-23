/**
 * Payment normalization tests
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeRazorpayPayment,
  normalizePaymentEntity,
  RazorpayError,
  type RazorpayConfig,
  type RazorpayWebhookEvent,
  type RazorpayPaymentEntity,
} from '../src/index.js';

const TEST_CONFIG: RazorpayConfig = {
  webhookSecret: 'test_webhook_secret',
};

/**
 * Helper to create a valid payment entity
 */
function createPaymentEntity(
  overrides: Partial<RazorpayPaymentEntity> = {}
): RazorpayPaymentEntity {
  return {
    id: 'pay_123456789',
    entity: 'payment',
    amount: 50000, // 500.00 INR in paise
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    international: false,
    amount_refunded: 0,
    captured: true,
    created_at: 1703001600,
    ...overrides,
  };
}

/**
 * Helper to create a valid webhook event
 */
function createWebhookEvent(
  payment: RazorpayPaymentEntity = createPaymentEntity()
): RazorpayWebhookEvent {
  return {
    entity: 'event',
    account_id: 'acc_123',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: payment,
      },
    },
    created_at: 1703001600,
  };
}

describe('normalizeRazorpayPayment', () => {
  it('should normalize a basic UPI payment', () => {
    const event = createWebhookEvent();
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    expect(evidence.rail).toBe('razorpay');
    expect(evidence.reference).toBe('pay_123456789');
    expect(evidence.amount).toBe(50000); // Minor units, NO division
    expect(evidence.currency).toBe('INR');
    expect(evidence.asset).toBe('INR');
    expect(evidence.env).toBe('live');
    expect(evidence.evidence).toBeDefined();
    expect((evidence.evidence as Record<string, unknown>).method).toBe('upi');
  });

  it('should normalize a card payment', () => {
    const payment = createPaymentEntity({
      method: 'card',
      card: {
        network: 'Visa',
        type: 'credit',
        last4: '1234',
        international: false,
      },
    });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    expect(evidence.evidence).toBeDefined();
    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.method).toBe('card');
    expect(ev.card).toEqual({
      network: 'Visa',
      type: 'credit',
      last4: '1234',
      international: false,
    });
  });

  it('should normalize a netbanking payment', () => {
    const payment = createPaymentEntity({
      method: 'netbanking',
      bank: 'HDFC',
    });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    expect(evidence.evidence).toBeDefined();
    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.method).toBe('netbanking');
    expect(ev.bank).toBe('HDFC');
  });

  it('should include order_id if present', () => {
    const payment = createPaymentEntity({
      order_id: 'order_123',
    });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.order_id).toBe('order_123');
  });

  it('should include invoice_id if present', () => {
    const payment = createPaymentEntity({
      invoice_id: 'inv_123',
    });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.invoice_id).toBe('inv_123');
  });

  it('should include acquirer data if present', () => {
    const payment = createPaymentEntity({
      acquirer_data: {
        rrn: '123456789012',
        auth_code: 'AUTH01',
      },
    });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.acquirer_data).toEqual({
      rrn: '123456789012',
      auth_code: 'AUTH01',
    });
  });

  it('should include keyId in evidence if provided', () => {
    const configWithKeyId: RazorpayConfig = {
      ...TEST_CONFIG,
      keyId: 'rzp_test_123',
    };
    const event = createWebhookEvent();
    const evidence = normalizeRazorpayPayment(event, configWithKeyId);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.key_id).toBe('rzp_test_123');
  });
});

describe('amount validation', () => {
  it('should accept valid integer amounts', () => {
    const payment = createPaymentEntity({ amount: 100000 }); // 1000.00 INR
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);
    expect(evidence.amount).toBe(100000);
  });

  it('should accept zero amount', () => {
    const payment = createPaymentEntity({ amount: 0 });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);
    expect(evidence.amount).toBe(0);
  });

  it('should reject non-integer amounts', () => {
    const payment = createPaymentEntity({ amount: 100.5 });
    const event = createWebhookEvent(payment);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('not an integer');
  });

  it('should reject negative amounts', () => {
    const payment = createPaymentEntity({ amount: -100 });
    const event = createWebhookEvent(payment);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('negative');
  });

  it('should reject amounts exceeding MAX_SAFE_INTEGER', () => {
    const payment = createPaymentEntity({ amount: Number.MAX_SAFE_INTEGER + 1 });
    const event = createWebhookEvent(payment);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('not a safe integer');
  });

  it('should accept MAX_SAFE_INTEGER', () => {
    const payment = createPaymentEntity({ amount: Number.MAX_SAFE_INTEGER });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);
    expect(evidence.amount).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('currency validation', () => {
  it('should accept valid uppercase currency', () => {
    const payment = createPaymentEntity({ currency: 'USD' });
    const event = createWebhookEvent(payment);
    const evidence = normalizeRazorpayPayment(event, TEST_CONFIG);
    expect(evidence.currency).toBe('USD');
  });

  it('should reject lowercase currency', () => {
    const payment = createPaymentEntity({ currency: 'inr' as unknown as string });
    const event = createWebhookEvent(payment);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('must be uppercase');
  });

  it('should reject invalid currency format', () => {
    const payment = createPaymentEntity({ currency: 'INDIA' as unknown as string });
    const event = createWebhookEvent(payment);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
  });
});

describe('event type validation', () => {
  it('should accept payment.captured event', () => {
    const event = createWebhookEvent();
    event.event = 'payment.captured';
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).not.toThrow();
  });

  it('should accept payment.authorized event', () => {
    const event = createWebhookEvent();
    event.event = 'payment.authorized';
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).not.toThrow();
  });

  it('should accept payment.failed event', () => {
    const event = createWebhookEvent();
    event.event = 'payment.failed';
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).not.toThrow();
  });

  it('should reject unsupported event types', () => {
    const event = createWebhookEvent();
    event.event = 'order.paid';
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('Unsupported webhook event');
  });
});

describe('payload validation', () => {
  it('should reject non-object event', () => {
    expect(() => normalizeRazorpayPayment(null, TEST_CONFIG)).toThrow(RazorpayError);
    expect(() => normalizeRazorpayPayment('string', TEST_CONFIG)).toThrow(RazorpayError);
  });

  it('should reject event without entity field', () => {
    const event = { ...createWebhookEvent(), entity: undefined };
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow('not a Razorpay event');
  });

  it('should reject event without payment payload', () => {
    const event = createWebhookEvent();
    event.payload = {};
    expect(() => normalizeRazorpayPayment(event, TEST_CONFIG)).toThrow(
      'does not contain a payment'
    );
  });
});

describe('normalizePaymentEntity', () => {
  it('should normalize payment entity directly', () => {
    const payment = createPaymentEntity();
    const evidence = normalizePaymentEntity(payment, TEST_CONFIG);

    expect(evidence.rail).toBe('razorpay');
    expect(evidence.reference).toBe('pay_123456789');
    expect(evidence.amount).toBe(50000);
  });

  it('should allow environment override', () => {
    const payment = createPaymentEntity();
    const evidence = normalizePaymentEntity(payment, TEST_CONFIG, 'test');
    expect(evidence.env).toBe('test');
  });
});
