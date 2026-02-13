/**
 * Tests for Stripe rail adapter
 */

import { describe, it, expect } from 'vitest';
import {
  fromCheckoutSession,
  fromPaymentIntent,
  fromCryptoPaymentIntent,
  fromWebhookEvent,
  type StripeCheckoutSession,
  type StripePaymentIntent,
  type StripeCryptoPaymentIntent,
  type StripeWebhookEvent,
} from '../src/index';

describe('Stripe rail adapter', () => {
  describe('fromCheckoutSession', () => {
    it('should normalize Stripe checkout session', () => {
      const session: StripeCheckoutSession = {
        id: 'cs_test_a1b2c3d4e5f6',
        amount_total: 9999,
        currency: 'usd',
        payment_intent: 'pi_test_123',
        customer: 'cus_test_456',
        metadata: {
          order_id: 'order_789',
        },
      };

      const normalized = fromCheckoutSession(session);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('cs_test_a1b2c3d4e5f6');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD'); // Uppercase
      expect(normalized.evidence).toMatchObject({
        checkout_session_id: 'cs_test_a1b2c3d4e5f6',
        payment_intent_id: 'pi_test_123',
        customer_id: 'cus_test_456',
        metadata: {
          order_id: 'order_789',
        },
      });
    });

    it('should handle minimal checkout session', () => {
      const session: StripeCheckoutSession = {
        id: 'cs_test_minimal',
        amount_total: 1000,
        currency: 'eur',
      };

      const normalized = fromCheckoutSession(session);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('cs_test_minimal');
      expect(normalized.amount).toBe(1000);
      expect(normalized.currency).toBe('EUR');
      expect(normalized.evidence).toMatchObject({
        checkout_session_id: 'cs_test_minimal',
      });
    });

    it('should reject checkout session without id', () => {
      const session = {
        amount_total: 9999,
        currency: 'usd',
      } as StripeCheckoutSession;

      expect(() => fromCheckoutSession(session)).toThrow('missing id');
    });

    it('should reject checkout session with invalid amount', () => {
      const session = {
        id: 'cs_test',
        amount_total: -100,
        currency: 'usd',
      } as StripeCheckoutSession;

      expect(() => fromCheckoutSession(session)).toThrow('invalid amount_total');
    });

    it('should reject checkout session with invalid currency', () => {
      const session = {
        id: 'cs_test',
        amount_total: 9999,
        currency: 'INVALID',
      } as StripeCheckoutSession;

      expect(() => fromCheckoutSession(session)).toThrow('invalid currency');
    });
  });

  describe('fromPaymentIntent', () => {
    it('should normalize Stripe payment intent', () => {
      const intent: StripePaymentIntent = {
        id: 'pi_test_a1b2c3d4e5f6',
        amount: 9999,
        currency: 'gbp',
        customer: 'cus_test_456',
        metadata: {
          invoice_id: 'inv_789',
        },
      };

      const normalized = fromPaymentIntent(intent);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('pi_test_a1b2c3d4e5f6');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('GBP'); // Uppercase
      expect(normalized.evidence).toMatchObject({
        payment_intent_id: 'pi_test_a1b2c3d4e5f6',
        customer_id: 'cus_test_456',
        metadata: {
          invoice_id: 'inv_789',
        },
      });
    });

    it('should handle minimal payment intent', () => {
      const intent: StripePaymentIntent = {
        id: 'pi_test_minimal',
        amount: 500,
        currency: 'jpy',
      };

      const normalized = fromPaymentIntent(intent);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('pi_test_minimal');
      expect(normalized.amount).toBe(500);
      expect(normalized.currency).toBe('JPY');
      expect(normalized.evidence).toMatchObject({
        payment_intent_id: 'pi_test_minimal',
      });
    });
  });

  describe('fromWebhookEvent', () => {
    it('should normalize checkout.session.completed event', () => {
      const event: StripeWebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_webhook',
            amount_total: 9999,
            currency: 'usd',
            payment_intent: 'pi_test_webhook',
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('cs_test_webhook');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD');
    });

    it('should normalize payment_intent.succeeded event', () => {
      const event: StripeWebhookEvent = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_webhook',
            amount: 9999,
            currency: 'usd',
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('pi_test_webhook');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD');
    });

    it('should reject unsupported event types', () => {
      const event: StripeWebhookEvent = {
        type: 'unsupported.event',
        data: {
          object: {} as StripeCheckoutSession,
        },
      };

      expect(() => fromWebhookEvent(event)).toThrow('Unsupported Stripe webhook event type');
    });
  });

  describe('fromCryptoPaymentIntent', () => {
    it('should normalize Stripe crypto payment intent with full fields', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test_crypto_a1b2c3',
        amount: 50000,
        currency: 'usd',
        asset: 'usdc',
        network: 'eip155:8453',
        tx_hash: '0xabc123def456',
        recipient: '0x1234567890abcdef',
        customer: 'cus_test_789',
        metadata: {
          x402_session: 'sess_001',
        },
      };

      const normalized = fromCryptoPaymentIntent(intent);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('pi_test_crypto_a1b2c3');
      expect(normalized.amount).toBe(50000);
      expect(normalized.currency).toBe('USD');
      expect(normalized.asset).toBe('USDC');
      expect(normalized.network).toBe('eip155:8453');
      expect(normalized.env).toBe('live');
      expect(normalized.evidence).toMatchObject({
        payment_intent_id: 'pi_test_crypto_a1b2c3',
        asset: 'USDC',
        network: 'eip155:8453',
        tx_hash: '0xabc123def456',
        recipient: '0x1234567890abcdef',
        customer_id: 'cus_test_789',
        metadata: { x402_session: 'sess_001' },
      });
    });

    it('should normalize minimal crypto payment intent', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test_crypto_minimal',
        amount: 100,
        currency: 'usd',
        asset: 'eth',
        network: 'eip155:1',
      };

      const normalized = fromCryptoPaymentIntent(intent);

      expect(normalized.rail).toBe('stripe');
      expect(normalized.reference).toBe('pi_test_crypto_minimal');
      expect(normalized.amount).toBe(100);
      expect(normalized.currency).toBe('USD');
      expect(normalized.asset).toBe('ETH');
      expect(normalized.network).toBe('eip155:1');
      expect(normalized.evidence).toMatchObject({
        payment_intent_id: 'pi_test_crypto_minimal',
        asset: 'ETH',
        network: 'eip155:1',
      });
      // No optional fields in evidence
      expect(normalized.evidence).not.toHaveProperty('tx_hash');
      expect(normalized.evidence).not.toHaveProperty('recipient');
      expect(normalized.evidence).not.toHaveProperty('customer_id');
    });

    it('should support test environment', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test_crypto_testenv',
        amount: 500,
        currency: 'usd',
        asset: 'usdc',
        network: 'eip155:84532',
      };

      const normalized = fromCryptoPaymentIntent(intent, 'test');

      expect(normalized.env).toBe('test');
    });

    it('should reject crypto intent without id', () => {
      const intent = {
        amount: 100,
        currency: 'usd',
        asset: 'usdc',
        network: 'eip155:8453',
      } as StripeCryptoPaymentIntent;

      expect(() => fromCryptoPaymentIntent(intent)).toThrow('missing id');
    });

    it('should reject crypto intent with invalid amount', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test',
        amount: -1,
        currency: 'usd',
        asset: 'usdc',
        network: 'eip155:8453',
      };

      expect(() => fromCryptoPaymentIntent(intent)).toThrow('invalid amount');
    });

    it('should reject crypto intent with invalid currency', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test',
        amount: 100,
        currency: 'INVALID',
        asset: 'usdc',
        network: 'eip155:8453',
      };

      expect(() => fromCryptoPaymentIntent(intent)).toThrow('invalid currency');
    });

    it('should reject crypto intent without asset', () => {
      const intent = {
        id: 'pi_test',
        amount: 100,
        currency: 'usd',
        network: 'eip155:8453',
      } as StripeCryptoPaymentIntent;

      expect(() => fromCryptoPaymentIntent(intent)).toThrow('missing asset');
    });

    it('should reject crypto intent without network', () => {
      const intent = {
        id: 'pi_test',
        amount: 100,
        currency: 'usd',
        asset: 'usdc',
      } as StripeCryptoPaymentIntent;

      expect(() => fromCryptoPaymentIntent(intent)).toThrow('missing network');
    });

    it('should ensure asset differs from currency for crypto payments', () => {
      const intent: StripeCryptoPaymentIntent = {
        id: 'pi_test_crypto_diff',
        amount: 1000,
        currency: 'usd',
        asset: 'usdc',
        network: 'eip155:8453',
      };

      const normalized = fromCryptoPaymentIntent(intent);

      // Currency is the fiat denomination, asset is the crypto token
      expect(normalized.currency).toBe('USD');
      expect(normalized.asset).toBe('USDC');
      expect(normalized.currency).not.toBe(normalized.asset);
    });
  });

  describe('currency normalization', () => {
    it('should convert lowercase to uppercase', () => {
      const session: StripeCheckoutSession = {
        id: 'cs_test',
        amount_total: 1000,
        currency: 'inr', // Lowercase
      };

      const normalized = fromCheckoutSession(session);
      expect(normalized.currency).toBe('INR'); // Uppercase
    });
  });
});
