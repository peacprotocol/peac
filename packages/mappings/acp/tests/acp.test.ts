/**
 * Tests for ACP (Agentic Commerce Protocol) integration
 */

import { describe, it, expect } from 'vitest';
import {
  fromACPCheckoutSuccess,
  attachReceiptToACPResponse,
  extractReceiptFromACPResponse,
  type ACPCheckoutSuccess,
} from '../src/index';
import { issue } from '../../../protocol/src/issue';
import { generateKeypair } from '../../../crypto/src/jws';

describe('ACP integration', () => {
  describe('fromACPCheckoutSuccess', () => {
    it('should convert ACP checkout event to PEAC receipt input', () => {
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_abc123',
        resource_uri: 'https://api.example.com/resources/456',
        total_amount: 9999,
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        customer_id: 'cus_xyz',
        metadata: {
          order_id: 'order_789',
        },
      };

      const receiptInput = fromACPCheckoutSuccess(acpEvent);

      expect(receiptInput.subject_uri).toBe('https://api.example.com/resources/456');
      expect(receiptInput.amt).toBe(9999);
      expect(receiptInput.cur).toBe('USD');
      expect(receiptInput.payment.rail).toBe('stripe');
      expect(receiptInput.payment.reference).toBe('cs_test_123');
      expect(receiptInput.payment.amount).toBe(9999);
      expect(receiptInput.payment.currency).toBe('USD');
      expect(receiptInput.payment.evidence).toMatchObject({
        checkout_id: 'checkout_abc123',
        customer_id: 'cus_xyz',
        acp_metadata: {
          order_id: 'order_789',
        },
      });
    });

    it('should handle minimal ACP checkout event', () => {
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_minimal',
        resource_uri: 'https://api.example.com/resource',
        total_amount: 1000,
        currency: 'EUR',
        payment_rail: 'x402',
        payment_reference: 'inv_123',
      };

      const receiptInput = fromACPCheckoutSuccess(acpEvent);

      expect(receiptInput.subject_uri).toBe('https://api.example.com/resource');
      expect(receiptInput.amt).toBe(1000);
      expect(receiptInput.cur).toBe('EUR');
      expect(receiptInput.payment.rail).toBe('x402');
      expect(receiptInput.payment.reference).toBe('inv_123');
    });

    it('should reject ACP event without checkout_id', () => {
      const acpEvent = {
        resource_uri: 'https://api.example.com/resource',
        total_amount: 9999,
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_123',
      } as ACPCheckoutSuccess;

      expect(() => fromACPCheckoutSuccess(acpEvent)).toThrow('missing checkout_id');
    });

    it('should reject ACP event with non-https resource_uri', () => {
      const acpEvent = {
        checkout_id: 'checkout_123',
        resource_uri: 'http://api.example.com/resource', // HTTP not allowed
        total_amount: 9999,
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_123',
      } as ACPCheckoutSuccess;

      expect(() => fromACPCheckoutSuccess(acpEvent)).toThrow('invalid resource_uri');
    });

    it('should reject ACP event with invalid currency', () => {
      const acpEvent = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        total_amount: 9999,
        currency: 'usd', // Must be uppercase
        payment_rail: 'stripe',
        payment_reference: 'cs_123',
      } as ACPCheckoutSuccess;

      expect(() => fromACPCheckoutSuccess(acpEvent)).toThrow('invalid currency');
    });
  });

  describe('Golden Vector A: ACP → PEAC Receipt', () => {
    it('should produce a valid PEAC receipt from ACP checkout (Stripe)', async () => {
      // ACP checkout success event (Stripe)
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_golden_stripe',
        resource_uri: 'https://api.example.com/api/resource/123',
        total_amount: 9999,
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_golden_stripe',
        customer_id: 'cus_golden',
        metadata: {
          order_id: 'order_golden_stripe',
        },
      };

      // Convert to PEAC receipt input
      const receiptInput = fromACPCheckoutSuccess(acpEvent);

      // Generate keypair
      const { privateKey } = await generateKeypair();

      // Issue PEAC receipt
      const receiptJWS = await issue({
        iss: 'https://merchant.example.com',
        aud: 'https://api.example.com',
        amt: receiptInput.amt,
        cur: receiptInput.cur,
        rail: receiptInput.payment.rail,
        reference: receiptInput.payment.reference,
        asset: receiptInput.payment.asset,
        env: receiptInput.payment.env,
        evidence: receiptInput.payment.evidence,
        subject: receiptInput.subject_uri,
        privateKey,
        kid: '2025-01-26T12:00:00Z',
      });

      // Verify it's a valid JWS
      expect(receiptJWS.split('.')).toHaveLength(3);

      // Log golden vector
      console.log('\n=== GOLDEN VECTOR A (ACP → PEAC, Stripe) ===');
      console.log('ACP Event:', JSON.stringify(acpEvent, null, 2));
      console.log('PEAC Receipt JWS:', receiptJWS);
      console.log('===========================================\n');
    });

    it('should produce a valid PEAC receipt from ACP checkout (x402)', async () => {
      // ACP checkout success event (x402)
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_golden_x402',
        resource_uri: 'https://api.example.com/api/resource/456',
        total_amount: 9999,
        currency: 'USD',
        payment_rail: 'x402',
        payment_reference: 'inv_test_golden_x402',
        customer_id: 'cus_golden',
        metadata: {
          order_id: 'order_golden_x402',
        },
      };

      // Convert to PEAC receipt input
      const receiptInput = fromACPCheckoutSuccess(acpEvent);

      // Generate keypair
      const { privateKey } = await generateKeypair();

      // Issue PEAC receipt
      const receiptJWS = await issue({
        iss: 'https://merchant.example.com',
        aud: 'https://api.example.com',
        amt: receiptInput.amt,
        cur: receiptInput.cur,
        rail: receiptInput.payment.rail,
        reference: receiptInput.payment.reference,
        asset: receiptInput.payment.asset,
        env: receiptInput.payment.env,
        evidence: receiptInput.payment.evidence,
        subject: receiptInput.subject_uri,
        privateKey,
        kid: '2025-01-26T12:00:00Z',
      });

      // Verify it's a valid JWS
      expect(receiptJWS.split('.')).toHaveLength(3);

      // Log golden vector
      console.log('\n=== GOLDEN VECTOR B (ACP → PEAC, x402) ===');
      console.log('ACP Event:', JSON.stringify(acpEvent, null, 2));
      console.log('PEAC Receipt JWS:', receiptJWS);
      console.log('=========================================\n');
    });
  });

  describe('Receipt attachment to ACP response', () => {
    it('should attach PEAC receipt to ACP response', () => {
      const acpResponse = {
        checkout_id: 'checkout_123',
        status: 'completed',
        amount: 9999,
      };

      const receiptJWS = 'eyJhbGc...';

      const withReceipt = attachReceiptToACPResponse(acpResponse, receiptJWS);

      expect(withReceipt).toMatchObject({
        checkout_id: 'checkout_123',
        status: 'completed',
        amount: 9999,
        peac_receipt: 'eyJhbGc...',
      });
    });

    it('should extract PEAC receipt from ACP response', () => {
      const acpResponse = {
        checkout_id: 'checkout_123',
        peac_receipt: 'eyJhbGc...',
      };

      const extracted = extractReceiptFromACPResponse(acpResponse);

      expect(extracted).toBe('eyJhbGc...');
    });

    it('should return null if no receipt in ACP response', () => {
      const acpResponse = {
        checkout_id: 'checkout_123',
      };

      const extracted = extractReceiptFromACPResponse(acpResponse);

      expect(extracted).toBeNull();
    });
  });
});
