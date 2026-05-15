/**
 * Tests for ACP (Agentic Commerce Protocol) integration
 */

import { describe, it, expect } from 'vitest';
import {
  fromACPCheckoutSuccess,
  attachReceiptToACPResponse,
  extractReceiptFromACPResponse,
  ACPMapperBoundaryError,
  type ACPCheckoutSuccess,
  type ACPMapperBoundaryErrorCode,
} from '../src/index';
import { issueWire01 } from '../../../protocol/src/issue';
import { generateKeypair } from '../../../crypto/src/jws';

function expectAcpError(
  fn: () => unknown,
  code: ACPMapperBoundaryErrorCode,
  field: string
): ACPMapperBoundaryError {
  let captured: unknown;
  try {
    fn();
  } catch (err) {
    captured = err;
  }
  expect(captured).toBeInstanceOf(ACPMapperBoundaryError);
  const e = captured as ACPMapperBoundaryError;
  expect(e.code).toBe(code);
  expect(e.field).toBe(field);
  return e;
}

describe('ACP integration', () => {
  describe('fromACPCheckoutSuccess', () => {
    it('should convert ACP checkout event to PEAC receipt input', () => {
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_abc123',
        resource_uri: 'https://api.example.com/resources/456',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live',
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
      expect(receiptInput.payment.env).toBe('live');
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
        amount_minor: '1000',
        currency: 'EUR',
        payment_rail: 'x402',
        payment_reference: 'inv_123',
        env: 'live',
      };

      const receiptInput = fromACPCheckoutSuccess(acpEvent);

      expect(receiptInput.subject_uri).toBe('https://api.example.com/resource');
      expect(receiptInput.amt).toBe(1000);
      expect(receiptInput.cur).toBe('EUR');
      expect(receiptInput.payment.rail).toBe('x402');
      expect(receiptInput.payment.reference).toBe('inv_123');
    });

    it('should preserve test env when asserted by upstream', () => {
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_sandbox',
        resource_uri: 'https://api.example.com/resource',
        amount_minor: '500',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_sandbox',
        env: 'test',
      };

      const receiptInput = fromACPCheckoutSuccess(acpEvent);
      expect(receiptInput.payment.env).toBe('test');
    });

    describe('structured validation errors', () => {
      const base = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live' as const,
      };

      it('rejects null event with acp.checkout_invalid_event', () => {
        expectAcpError(
          () => fromACPCheckoutSuccess(null as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_event',
          'event'
        );
      });

      it('rejects undefined event with acp.checkout_invalid_event', () => {
        expectAcpError(
          () => fromACPCheckoutSuccess(undefined as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_event',
          'event'
        );
      });

      it('rejects non-object event (string) with acp.checkout_invalid_event', () => {
        expectAcpError(
          () => fromACPCheckoutSuccess('not-an-event' as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_event',
          'event'
        );
      });

      it('rejects missing checkout_id with acp.checkout_missing_checkout_id', () => {
        const { checkout_id: _drop, ...rest } = base;
        expectAcpError(
          () => fromACPCheckoutSuccess(rest as unknown as ACPCheckoutSuccess),
          'acp.checkout_missing_checkout_id',
          'checkout_id'
        );
      });

      it('rejects lowercase currency with acp.checkout_invalid_currency', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              currency: 'usd',
            } as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_currency',
          'currency'
        );
      });

      it('rejects missing payment_rail with acp.checkout_missing_payment_rail', () => {
        const { payment_rail: _drop, ...rest } = base;
        expectAcpError(
          () => fromACPCheckoutSuccess(rest as unknown as ACPCheckoutSuccess),
          'acp.checkout_missing_payment_rail',
          'payment_rail'
        );
      });

      it('rejects missing payment_reference with acp.checkout_missing_payment_reference', () => {
        const { payment_reference: _drop, ...rest } = base;
        expectAcpError(
          () => fromACPCheckoutSuccess(rest as unknown as ACPCheckoutSuccess),
          'acp.checkout_missing_payment_reference',
          'payment_reference'
        );
      });
    });

    describe('amount_minor validation', () => {
      const base = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live' as const,
      };

      it('rejects legacy numeric total_amount with acp.checkout_legacy_total_amount', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              total_amount: 9999,
            } as unknown as ACPCheckoutSuccess),
          'acp.checkout_legacy_total_amount',
          'total_amount'
        );
      });

      it('rejects missing amount_minor with acp.checkout_invalid_amount_minor', () => {
        expectAcpError(
          () => fromACPCheckoutSuccess(base as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
      });

      it('rejects numeric amount_minor with acp.checkout_invalid_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: 9999,
            } as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
      });

      it('rejects empty-string amount_minor with acp.checkout_invalid_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '',
            } as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
      });

      it('rejects decimal amount_minor with acp.checkout_invalid_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '99.99',
            } as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
      });

      it('rejects comma-formatted amount_minor with acp.checkout_invalid_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '9,999',
            } as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
      });

      it('rejects negative amount_minor with acp.checkout_invalid_amount_minor', () => {
        const e = expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '-100',
            } as ACPCheckoutSuccess),
          'acp.checkout_invalid_amount_minor',
          'amount_minor'
        );
        expect(e.message).toMatch(/non-negative/);
      });

      it('accepts zero amount_minor (free checkout)', () => {
        const result = fromACPCheckoutSuccess({
          ...base,
          amount_minor: '0',
        } as ACPCheckoutSuccess);
        expect(result.amt).toBe(0);
        expect(result.payment.amount).toBe(0);
      });
    });

    describe('amount_minor safe-integer boundary', () => {
      const base = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live' as const,
      };

      it('accepts Number.MAX_SAFE_INTEGER as string', () => {
        const result = fromACPCheckoutSuccess({
          ...base,
          amount_minor: '9007199254740991',
        });
        expect(result.amt).toBe(Number.MAX_SAFE_INTEGER);
        expect(result.payment.amount).toBe(Number.MAX_SAFE_INTEGER);
      });

      it('rejects Number.MAX_SAFE_INTEGER + 1 with acp.checkout_unsafe_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '9007199254740992',
            }),
          'acp.checkout_unsafe_amount_minor',
          'amount_minor'
        );
      });

      it('rejects 39-digit amount_minor with acp.checkout_unsafe_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '999999999999999999999999999999999999999',
            }),
          'acp.checkout_unsafe_amount_minor',
          'amount_minor'
        );
      });

      it('rejects mid-range unsafe amount with acp.checkout_unsafe_amount_minor', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              amount_minor: '99999999999999999',
            }),
          'acp.checkout_unsafe_amount_minor',
          'amount_minor'
        );
      });
    });

    describe('resource_uri validation', () => {
      const base = {
        checkout_id: 'checkout_123',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live' as const,
      };

      it('accepts a well-formed https URL with hostname and path', () => {
        expect(() =>
          fromACPCheckoutSuccess({
            ...base,
            resource_uri: 'https://example.com/resource',
          })
        ).not.toThrow();
      });

      it('accepts an https URL with no path (hostname only)', () => {
        expect(() =>
          fromACPCheckoutSuccess({
            ...base,
            resource_uri: 'https://example.com',
          })
        ).not.toThrow();
      });

      it('rejects http:// resource_uri with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'http://example.com/resource',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects "https://" (no hostname) with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'https://',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects "not-a-url" with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'not-a-url',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects empty-string resource_uri with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: '',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects missing resource_uri with acp.checkout_invalid_resource_uri', () => {
        const { ...rest } = base;
        expectAcpError(
          () => fromACPCheckoutSuccess(rest as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects ws:// scheme with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'ws://example.com/socket',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects opaque-path "https:example.com" (no //) with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'https:example.com',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects credential-bearing https URL (username) with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'https://user:pass@example.com/resource',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });

      it('rejects username-only credential https URL with acp.checkout_invalid_resource_uri', () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              resource_uri: 'https://user@example.com/resource',
            }),
          'acp.checkout_invalid_resource_uri',
          'resource_uri'
        );
      });
    });

    describe('env (finality-boundary) validation', () => {
      const base = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
      };

      it('rejects missing env with acp.checkout_missing_env', () => {
        expectAcpError(
          () => fromACPCheckoutSuccess(base as unknown as ACPCheckoutSuccess),
          'acp.checkout_missing_env',
          'env'
        );
      });

      it("rejects env values outside 'live' | 'test' with acp.checkout_invalid_env", () => {
        expectAcpError(
          () =>
            fromACPCheckoutSuccess({
              ...base,
              env: 'production',
            } as unknown as ACPCheckoutSuccess),
          'acp.checkout_invalid_env',
          'env'
        );
      });

      it('passes the finality guard with explicit currency + env (strict mode)', () => {
        const evt = { ...base, env: 'live' as const };
        expect(() => fromACPCheckoutSuccess(evt, { mode: 'strict' })).not.toThrow();
      });
    });

    describe('non-finality invariant', () => {
      // fromACPCheckoutSuccess does NOT synthesize commerce finality. A
      // checkout-success observation alone does not prove authorization,
      // capture, settlement, refund, void, or chargeback. The mapper records
      // checkout/payment evidence only and MUST NOT emit any of these
      // finality-bearing fields. This block locks that invariant.
      const base = {
        checkout_id: 'checkout_123',
        resource_uri: 'https://api.example.com/resource',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_123',
        env: 'live' as const,
      };

      it('does not emit commerce_event in evidence', () => {
        const result = fromACPCheckoutSuccess(base);
        expect(result.payment.evidence).not.toHaveProperty('commerce_event');
      });

      it('does not emit settlement_state in evidence', () => {
        const result = fromACPCheckoutSuccess(base);
        expect(result.payment.evidence).not.toHaveProperty('settlement_state');
      });

      it('does not emit capture_state in evidence', () => {
        const result = fromACPCheckoutSuccess(base);
        expect(result.payment.evidence).not.toHaveProperty('capture_state');
      });

      it('does not emit authorization_state in evidence', () => {
        const result = fromACPCheckoutSuccess(base);
        expect(result.payment.evidence).not.toHaveProperty('authorization_state');
      });

      it('does not emit observed_payment_state in evidence', () => {
        const result = fromACPCheckoutSuccess(base);
        expect(result.payment.evidence).not.toHaveProperty('observed_payment_state');
      });
    });
  });

  describe('Golden Vector A: ACP -> PEAC Receipt', () => {
    it('should produce a valid PEAC receipt from ACP checkout (Stripe)', async () => {
      // ACP checkout success event (Stripe)
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_golden_stripe',
        resource_uri: 'https://api.example.com/api/resource/123',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'stripe',
        payment_reference: 'cs_test_golden_stripe',
        env: 'live',
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
      const result = await issueWire01({
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
      expect(result.jws.split('.')).toHaveLength(3);

      // Log golden vector
      console.log('\n=== GOLDEN VECTOR A (ACP -> PEAC, Stripe) ===');
      console.log('ACP Event:', JSON.stringify(acpEvent, null, 2));
      console.log('PEAC Receipt JWS:', result.jws);
      console.log('===========================================\n');
    });

    it('should produce a valid PEAC receipt from ACP checkout (x402)', async () => {
      // ACP checkout success event (x402)
      const acpEvent: ACPCheckoutSuccess = {
        checkout_id: 'checkout_golden_x402',
        resource_uri: 'https://api.example.com/api/resource/456',
        amount_minor: '9999',
        currency: 'USD',
        payment_rail: 'x402',
        payment_reference: 'inv_test_golden_x402',
        env: 'live',
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
      const result = await issueWire01({
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
      expect(result.jws.split('.')).toHaveLength(3);

      // Log golden vector
      console.log('\n=== GOLDEN VECTOR B (ACP -> PEAC, x402) ===');
      console.log('ACP Event:', JSON.stringify(acpEvent, null, 2));
      console.log('PEAC Receipt JWS:', result.jws);
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
