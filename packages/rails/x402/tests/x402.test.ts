/**
 * Tests for x402 rail adapter
 *
 * Coverage:
 * - v1 compatibility (all existing tests preserved)
 * - v2 dialect detection
 * - CAIP-2 network handling
 * - routing and pay_to propagation
 * - Aggregator + splits mapping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  fromInvoice,
  fromSettlement,
  fromWebhookEvent,
  detectDialect,
  normalizeNetworkId,
  getNetworkLabel,
  resolveDialectFromInvoice,
  _resetWarnedNetworks,
  type X402Invoice,
  type X402Settlement,
  type X402WebhookEvent,
  type X402Dialect,
  X402_HEADERS_V1,
  X402_HEADERS_V2,
  CAIP2_REGISTRY,
} from '../src/index';

// =============================================================================
// V1 TESTS (PRESERVED - ALL EXISTING BEHAVIOR)
// =============================================================================

describe('x402 rail adapter - v1 compatibility', () => {
  describe('fromInvoice', () => {
    it('should normalize x402 invoice', () => {
      const invoice: X402Invoice = {
        id: 'inv_a1b2c3d4e5f6',
        amount: 9999,
        currency: 'USD',
        session_id: 'sess_123',
        invoice_url: 'https://pay.x402.example/inv_a1b2c3d4e5f6',
        memo: 'Payment for API usage',
        metadata: {
          order_id: 'order_789',
        },
      };

      const normalized = fromInvoice(invoice);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_a1b2c3d4e5f6');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD');
      expect(normalized.network).toBe('lightning'); // v1 default
      expect(normalized.evidence).toMatchObject({
        invoice_id: 'inv_a1b2c3d4e5f6',
        dialect: 'v1',
        session_id: 'sess_123',
        invoice_url: 'https://pay.x402.example/inv_a1b2c3d4e5f6',
        memo: 'Payment for API usage',
        metadata: {
          order_id: 'order_789',
        },
      });
    });

    it('should handle minimal invoice', () => {
      const invoice: X402Invoice = {
        id: 'inv_minimal',
        amount: 1000,
        currency: 'EUR',
      };

      const normalized = fromInvoice(invoice);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_minimal');
      expect(normalized.amount).toBe(1000);
      expect(normalized.currency).toBe('EUR');
      expect(normalized.network).toBe('lightning');
      expect(normalized.evidence).toMatchObject({
        invoice_id: 'inv_minimal',
        dialect: 'v1',
      });
    });

    it('should reject invoice without id', () => {
      const invoice = {
        amount: 9999,
        currency: 'USD',
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow('missing id');
    });

    it('should reject invoice with invalid amount', () => {
      const invoice = {
        id: 'inv_test',
        amount: -100,
        currency: 'USD',
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow('invalid amount');
    });

    it('should reject invoice with invalid currency', () => {
      const invoice = {
        id: 'inv_test',
        amount: 9999,
        currency: 'invalid',
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow('invalid currency');
    });
  });

  describe('fromSettlement', () => {
    it('should normalize x402 settlement', () => {
      const settlement: X402Settlement = {
        id: 'settle_a1b2c3d4e5f6',
        invoice_id: 'inv_xyz',
        amount: 9999,
        currency: 'GBP',
        settled_at: '2025-01-26T10:00:00Z',
        metadata: {
          settlement_batch: 'batch_123',
        },
      };

      const normalized = fromSettlement(settlement);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_xyz'); // Uses invoice_id
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('GBP');
      expect(normalized.network).toBe('lightning');
      expect(normalized.evidence).toMatchObject({
        settlement_id: 'settle_a1b2c3d4e5f6',
        invoice_id: 'inv_xyz',
        dialect: 'v1',
        settled_at: '2025-01-26T10:00:00Z',
        metadata: {
          settlement_batch: 'batch_123',
        },
      });
    });

    it('should handle minimal settlement', () => {
      const settlement: X402Settlement = {
        id: 'settle_minimal',
        invoice_id: 'inv_123',
        amount: 500,
        currency: 'JPY',
      };

      const normalized = fromSettlement(settlement);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_123');
      expect(normalized.amount).toBe(500);
      expect(normalized.currency).toBe('JPY');
      expect(normalized.network).toBe('lightning');
      expect(normalized.evidence).toMatchObject({
        settlement_id: 'settle_minimal',
        invoice_id: 'inv_123',
        dialect: 'v1',
      });
    });

    it('should reject settlement without invoice_id', () => {
      const settlement = {
        id: 'settle_test',
        amount: 9999,
        currency: 'USD',
      } as X402Settlement;

      expect(() => fromSettlement(settlement)).toThrow('missing invoice_id');
    });
  });

  describe('fromWebhookEvent', () => {
    it('should normalize invoice.paid event', () => {
      const event: X402WebhookEvent = {
        type: 'invoice.paid',
        data: {
          object: {
            id: 'inv_webhook',
            amount: 9999,
            currency: 'USD',
            session_id: 'sess_webhook',
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_webhook');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD');
    });

    it('should normalize settlement.completed event', () => {
      const event: X402WebhookEvent = {
        type: 'settlement.completed',
        data: {
          object: {
            id: 'settle_webhook',
            invoice_id: 'inv_webhook',
            amount: 9999,
            currency: 'USD',
            settled_at: '2025-01-26T10:00:00Z',
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe('x402');
      expect(normalized.reference).toBe('inv_webhook');
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe('USD');
    });

    it('should reject unsupported event types', () => {
      const event: X402WebhookEvent = {
        type: 'unsupported.event',
        data: {
          object: {} as X402Invoice,
        },
      };

      expect(() => fromWebhookEvent(event)).toThrow('Unsupported x402 webhook event type');
    });
  });

  describe('currency normalization', () => {
    it('should preserve uppercase currency', () => {
      const invoice: X402Invoice = {
        id: 'inv_test',
        amount: 1000,
        currency: 'INR', // Already uppercase
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.currency).toBe('INR');
    });
  });
});

// =============================================================================
// V2 TESTS (NEW)
// =============================================================================

describe('x402 rail adapter - v2 support', () => {
  beforeEach(() => {
    _resetWarnedNetworks();
  });

  describe('dialect detection', () => {
    it('should detect v2 from Payment-Required header', () => {
      const headers = { 'Payment-Required': 'true' };
      expect(detectDialect(headers)).toBe('v2');
    });

    it('should detect v2 from Payment-Signature header', () => {
      const headers = { 'Payment-Signature': 'sig123' };
      expect(detectDialect(headers)).toBe('v2');
    });

    it('should detect v2 from Payment-Response header', () => {
      const headers = { 'Payment-Response': 'ok' };
      expect(detectDialect(headers)).toBe('v2');
    });

    it('should detect v2 case-insensitively', () => {
      const headers = { 'payment-required': 'true' };
      expect(detectDialect(headers)).toBe('v2');
    });

    it('should fall back to v1 with only v1 headers', () => {
      const headers = { 'X-PAYMENT': 'invoice123' };
      expect(detectDialect(headers)).toBe('v1');
    });

    it('should fall back to v1 with no headers', () => {
      expect(detectDialect(undefined)).toBe('v1');
      expect(detectDialect({})).toBe('v1');
    });

    it('should prefer v2 when both v1 and v2 headers present', () => {
      const headers = {
        'X-PAYMENT': 'invoice123',
        'Payment-Required': 'true',
      };
      expect(detectDialect(headers)).toBe('v2');
    });
  });

  describe('dialect resolution from invoice', () => {
    it('should detect v2 from CAIP-2 network', () => {
      const invoice: X402Invoice = {
        id: 'inv_caip',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
      };
      expect(resolveDialectFromInvoice(invoice, 'auto')).toBe('v2');
    });

    it('should detect v2 from payTo presence', () => {
      const invoice: X402Invoice = {
        id: 'inv_payto',
        amount: 1000,
        currency: 'USD',
        payTo: { mode: 'direct' },
      };
      expect(resolveDialectFromInvoice(invoice, 'auto')).toBe('v2');
    });

    it('should fall back to v1 for plain invoice', () => {
      const invoice: X402Invoice = {
        id: 'inv_plain',
        amount: 1000,
        currency: 'USD',
      };
      expect(resolveDialectFromInvoice(invoice, 'auto')).toBe('v1');
    });

    it('should respect explicit dialect', () => {
      const invoice: X402Invoice = {
        id: 'inv_test',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
      };
      expect(resolveDialectFromInvoice(invoice, 'v1')).toBe('v1');
      expect(resolveDialectFromInvoice(invoice, 'v2')).toBe('v2');
    });
  });

  describe('CAIP-2 network handling', () => {
    it('should preserve canonical CAIP-2 network ID', () => {
      const invoice: X402Invoice = {
        id: 'inv_base',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.network).toBe('eip155:8453'); // Canonical ID preserved
    });

    it('should add network_label for known networks', () => {
      const invoice: X402Invoice = {
        id: 'inv_base',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
      };

      const normalized = fromInvoice(invoice);
      expect((normalized.evidence as Record<string, unknown>).network_label).toBe('Base');
    });

    it('should pass through unknown network ID', () => {
      const invoice: X402Invoice = {
        id: 'inv_unknown',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:999999',
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.network).toBe('eip155:999999');
      expect((normalized.evidence as Record<string, unknown>).network_label).toBeUndefined();
    });

    it('should handle all known CAIP-2 networks', () => {
      for (const [caip2, info] of Object.entries(CAIP2_REGISTRY)) {
        expect(normalizeNetworkId(caip2)).toBe(caip2);
        expect(getNetworkLabel(caip2)).toBe(info.label);
      }
    });
  });

  describe('routing propagation', () => {
    it('should map payTo.mode to routing', () => {
      const invoice: X402Invoice = {
        id: 'inv_routing',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        payTo: { mode: 'direct' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.routing).toBe('direct');
    });

    it('should handle callback routing', () => {
      const invoice: X402Invoice = {
        id: 'inv_callback',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        payTo: { mode: 'callback', callback_url: 'https://example.com/callback' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.routing).toBe('callback');
      expect((normalized.evidence as Record<string, unknown>).pay_to).toMatchObject({
        mode: 'callback',
        callback_url: 'https://example.com/callback',
      });
    });

    it('should handle role routing', () => {
      const invoice: X402Invoice = {
        id: 'inv_role',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        payTo: { mode: 'role', role: 'publisher' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.routing).toBe('role');
    });

    it('should not set routing for invalid mode', () => {
      const invoice: X402Invoice = {
        id: 'inv_invalid_mode',
        amount: 1000,
        currency: 'USD',
        payTo: { mode: 'unknown' as 'direct' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.routing).toBeUndefined();
    });

    it('should not set routing without payTo', () => {
      const invoice: X402Invoice = {
        id: 'inv_no_payto',
        amount: 1000,
        currency: 'USD',
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.routing).toBeUndefined();
    });
  });

  describe('aggregator and splits mapping', () => {
    it('should set aggregator from metadata.aggregator', () => {
      const invoice: X402Invoice = {
        id: 'inv_agg',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        metadata: { aggregator: 'load' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.aggregator).toBe('x402:load');
    });

    it('should set aggregator from metadata.platform', () => {
      const invoice: X402Invoice = {
        id: 'inv_platform',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        metadata: { platform: 'tollbit' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.aggregator).toBe('x402:tollbit');
    });

    it('should create default merchant split when aggregator present', () => {
      const invoice: X402Invoice = {
        id: 'inv_default_split',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        metadata: { aggregator: 'load' },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.splits).toEqual([{ party: 'merchant', share: 1.0 }]);
    });

    it('should map explicit splits from metadata', () => {
      const invoice: X402Invoice = {
        id: 'inv_explicit_splits',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        metadata: {
          aggregator: 'load',
          splits: [
            { party: 'merchant', share: 0.8 },
            { party: 'platform', share: 0.2 },
          ],
        },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.splits).toEqual([
        { party: 'merchant', share: 0.8 },
        { party: 'platform', share: 0.2 },
      ]);
    });

    it('should filter invalid splits', () => {
      const invoice: X402Invoice = {
        id: 'inv_invalid_splits',
        amount: 1000,
        currency: 'USD',
        network: 'eip155:8453',
        metadata: {
          aggregator: 'load',
          splits: [
            { party: 'valid', share: 0.5 },
            { party: '', share: 0.3 }, // Invalid: empty party
            { party: 'no_amount' }, // Invalid: no amount or share
          ],
        },
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.splits).toEqual([{ party: 'valid', share: 0.5 }]);
    });

    it('should not set aggregator/splits for v1 invoices', () => {
      const invoice: X402Invoice = {
        id: 'inv_v1',
        amount: 1000,
        currency: 'USD',
        metadata: { aggregator: 'load' },
      };

      const normalized = fromInvoice(invoice, 'live', 'v1');
      expect(normalized.aggregator).toBeUndefined();
      expect(normalized.splits).toBeUndefined();
    });
  });

  describe('v2 golden vector', () => {
    it('should produce complete v2 PaymentEvidence', () => {
      const invoice: X402Invoice = {
        id: 'inv_v2_golden',
        amount: 50000,
        currency: 'USD',
        session_id: 'sess_golden',
        invoice_url: 'https://pay.load.network/inv_v2_golden',
        memo: 'API usage for December 2025',
        network: 'eip155:8453',
        payTo: {
          mode: 'callback',
          callback_url: 'https://api.example.com/payment-callback',
        },
        metadata: {
          aggregator: 'load',
          customer_id: 'cust_abc123',
          splits: [
            { party: 'merchant', share: 0.85 },
            { party: 'x402:load', share: 0.15 },
          ],
        },
      };

      const normalized = fromInvoice(invoice);

      // Top-level fields
      expect(normalized).toMatchObject({
        rail: 'x402',
        reference: 'inv_v2_golden',
        amount: 50000,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        network: 'eip155:8453',
        aggregator: 'x402:load',
        routing: 'callback',
      });

      // Splits
      expect(normalized.splits).toEqual([
        { party: 'merchant', share: 0.85 },
        { party: 'x402:load', share: 0.15 },
      ]);

      // Evidence (namespaced x402 data)
      const evidence = normalized.evidence as Record<string, unknown>;
      expect(evidence).toMatchObject({
        invoice_id: 'inv_v2_golden',
        dialect: 'v2',
        network_label: 'Base',
        session_id: 'sess_golden',
        invoice_url: 'https://pay.load.network/inv_v2_golden',
        memo: 'API usage for December 2025',
        pay_to: {
          mode: 'callback',
          callback_url: 'https://api.example.com/payment-callback',
        },
      });
    });
  });

  describe('webhook with headers', () => {
    it('should detect v2 from webhook headers', () => {
      const event: X402WebhookEvent = {
        type: 'invoice.paid',
        data: {
          object: {
            id: 'inv_v2_webhook',
            amount: 1000,
            currency: 'USD',
            network: 'eip155:8453',
          },
        },
      };

      const headers = { 'Payment-Response': 'success' };
      const normalized = fromWebhookEvent(event, 'live', headers);

      expect(normalized.network).toBe('eip155:8453');
      expect((normalized.evidence as Record<string, unknown>).dialect).toBe('v2');
    });
  });
});

// =============================================================================
// CONSTANTS AND HELPERS TESTS
// =============================================================================

describe('x402 constants and helpers', () => {
  it('should export v1 header constants', () => {
    expect(X402_HEADERS_V1).toEqual({
      paymentRequired: 'X-PAYMENT',
      paymentResponse: 'X-PAYMENT-RESPONSE',
    });
  });

  it('should export v2 header constants', () => {
    expect(X402_HEADERS_V2).toEqual({
      paymentRequired: 'Payment-Required',
      paymentSignature: 'Payment-Signature',
      paymentResponse: 'Payment-Response',
    });
  });

  it('should have complete CAIP-2 registry', () => {
    // Verify known networks
    expect(CAIP2_REGISTRY['eip155:8453']).toEqual({ label: 'Base', env: 'mainnet' });
    expect(CAIP2_REGISTRY['eip155:84532']).toEqual({ label: 'Base Sepolia', env: 'testnet' });
    expect(CAIP2_REGISTRY['solana:mainnet']).toEqual({ label: 'Solana', env: 'mainnet' });
    expect(CAIP2_REGISTRY['lightning']).toEqual({ label: 'Lightning', env: 'mainnet' });
  });
});
