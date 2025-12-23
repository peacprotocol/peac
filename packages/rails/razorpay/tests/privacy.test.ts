/**
 * VPA privacy and hashing tests
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  normalizeRazorpayPayment,
  hashVpa,
  type RazorpayConfig,
  type RazorpayWebhookEvent,
  type RazorpayPaymentEntity,
} from '../src/index.js';

const TEST_SECRET = 'test_webhook_secret';
const CUSTOM_HASH_KEY = 'custom_hash_key_for_vpa';

/**
 * Helper to create a UPI payment with VPA
 */
function createUpiPayment(vpa: string): RazorpayPaymentEntity {
  return {
    id: 'pay_upi_123',
    entity: 'payment',
    amount: 10000,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    international: false,
    amount_refunded: 0,
    captured: true,
    created_at: 1703001600,
    vpa,
  };
}

function createUpiEvent(vpa: string): RazorpayWebhookEvent {
  return {
    entity: 'event',
    account_id: 'acc_123',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: createUpiPayment(vpa),
      },
    },
    created_at: 1703001600,
  };
}

describe('hashVpa', () => {
  it('should produce consistent HMAC hash for same VPA and key', () => {
    const vpa = 'user@upi';
    const hash1 = hashVpa(vpa, TEST_SECRET);
    const hash2 = hashVpa(vpa, TEST_SECRET);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different VPAs', () => {
    const hash1 = hashVpa('user1@upi', TEST_SECRET);
    const hash2 = hashVpa('user2@upi', TEST_SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hash for different keys', () => {
    const vpa = 'user@upi';
    const hash1 = hashVpa(vpa, 'key1');
    const hash2 = hashVpa(vpa, 'key2');
    expect(hash1).not.toBe(hash2);
  });

  it('should normalize VPA to lowercase before hashing', () => {
    const hash1 = hashVpa('User@UPI', TEST_SECRET);
    const hash2 = hashVpa('user@upi', TEST_SECRET);
    expect(hash1).toBe(hash2);
  });

  it('should return 64 character hex string (SHA256)', () => {
    const hash = hashVpa('user@upi', TEST_SECRET);
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it('should match manual HMAC calculation', () => {
    const vpa = 'test@bank';
    const expectedHash = createHmac('sha256', TEST_SECRET).update(vpa.toLowerCase()).digest('hex');
    expect(hashVpa(vpa, TEST_SECRET)).toBe(expectedHash);
  });
});

describe('VPA hashing in normalization (default behavior)', () => {
  it('should hash VPA by default using webhookSecret', () => {
    const config: RazorpayConfig = { webhookSecret: TEST_SECRET };
    const event = createUpiEvent('user@paytm');
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa).toBeUndefined(); // Raw VPA should NOT be present
    expect(ev.vpa_hash).toBeDefined();
    expect(ev.vpa_hash).toBe(hashVpa('user@paytm', TEST_SECRET));
  });

  it('should use custom hashKey if provided', () => {
    const config: RazorpayConfig = {
      webhookSecret: TEST_SECRET,
      privacy: {
        hashKey: CUSTOM_HASH_KEY,
      },
    };
    const event = createUpiEvent('user@bank');
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa_hash).toBe(hashVpa('user@bank', CUSTOM_HASH_KEY));
    // Verify it's different from webhook secret hash
    expect(ev.vpa_hash).not.toBe(hashVpa('user@bank', TEST_SECRET));
  });

  it('should hash VPA from upi.vpa field if vpa is not present', () => {
    const payment: RazorpayPaymentEntity = {
      id: 'pay_upi_456',
      entity: 'payment',
      amount: 5000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
      international: false,
      amount_refunded: 0,
      captured: true,
      created_at: 1703001600,
      upi: {
        vpa: 'nested@vpa',
      },
    };
    const event: RazorpayWebhookEvent = {
      entity: 'event',
      account_id: 'acc_123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: { payment: { entity: payment } },
      created_at: 1703001600,
    };

    const config: RazorpayConfig = { webhookSecret: TEST_SECRET };
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa_hash).toBe(hashVpa('nested@vpa', TEST_SECRET));
  });
});

describe('UNSAFE raw VPA storage opt-in', () => {
  it('should store raw VPA when storeRawVpa is true', () => {
    const config: RazorpayConfig = {
      webhookSecret: TEST_SECRET,
      privacy: {
        storeRawVpa: true,
      },
    };
    const event = createUpiEvent('rawuser@upi');
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa).toBe('rawuser@upi'); // Raw VPA IS present
    expect(ev.vpa_hash).toBeUndefined(); // Hash should NOT be present
  });

  it('should NOT store raw VPA when storeRawVpa is false', () => {
    const config: RazorpayConfig = {
      webhookSecret: TEST_SECRET,
      privacy: {
        storeRawVpa: false,
      },
    };
    const event = createUpiEvent('user@bank');
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa).toBeUndefined();
    expect(ev.vpa_hash).toBeDefined();
  });

  it('should NOT store raw VPA when storeRawVpa is undefined', () => {
    const config: RazorpayConfig = {
      webhookSecret: TEST_SECRET,
      privacy: {}, // storeRawVpa not set
    };
    const event = createUpiEvent('user@bank');
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa).toBeUndefined();
    expect(ev.vpa_hash).toBeDefined();
  });
});

describe('non-UPI payments', () => {
  it('should not include VPA for card payments', () => {
    const payment: RazorpayPaymentEntity = {
      id: 'pay_card_123',
      entity: 'payment',
      amount: 10000,
      currency: 'INR',
      status: 'captured',
      method: 'card',
      international: false,
      amount_refunded: 0,
      captured: true,
      created_at: 1703001600,
      card: {
        network: 'Visa',
        type: 'credit',
        last4: '1234',
      },
    };
    const event: RazorpayWebhookEvent = {
      entity: 'event',
      account_id: 'acc_123',
      event: 'payment.captured',
      contains: ['payment'],
      payload: { payment: { entity: payment } },
      created_at: 1703001600,
    };

    const config: RazorpayConfig = { webhookSecret: TEST_SECRET };
    const evidence = normalizeRazorpayPayment(event, config);

    const ev = evidence.evidence as Record<string, unknown>;
    expect(ev.vpa).toBeUndefined();
    expect(ev.vpa_hash).toBeUndefined();
    expect(ev.card).toBeDefined();
  });
});

describe('hash key rotation considerations', () => {
  it('should produce different hashes when key changes', () => {
    const vpa = 'user@upi';
    const oldKey = 'old_hash_key';
    const newKey = 'new_hash_key';

    const oldHash = hashVpa(vpa, oldKey);
    const newHash = hashVpa(vpa, newKey);

    // Changing the key changes all hashes
    expect(oldHash).not.toBe(newHash);
  });
});
