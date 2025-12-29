import { describe, it, expect } from 'vitest';
import {
  parseMcpCallEvent,
  mapToPaymentEvidence,
  fromMcpCallEvent,
  fromWebhookEvent,
  type FluoraMcpCallEvent,
  type FluoraConfig,
} from '../src/index.js';

describe('x402-fluora adapter', () => {
  const validEvent: FluoraMcpCallEvent = {
    callId: 'call_abc123',
    serverId: 'server_xyz',
    toolName: 'search_web',
    amount: 100,
    currency: 'USD',
  };

  describe('parseMcpCallEvent', () => {
    it('should parse valid event', () => {
      const result = parseMcpCallEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.callId).toBe('call_abc123');
        expect(result.value.serverId).toBe('server_xyz');
        expect(result.value.toolName).toBe('search_web');
      }
    });

    it('should reject null event', () => {
      const result = parseMcpCallEvent(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('parse_error');
      }
    });

    it('should reject missing callId', () => {
      const result = parseMcpCallEvent({ ...validEvent, callId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
        expect(result.error).toContain('callId');
      }
    });

    it('should reject missing serverId', () => {
      const result = parseMcpCallEvent({ ...validEvent, serverId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
      }
    });

    it('should reject missing toolName', () => {
      const result = parseMcpCallEvent({ ...validEvent, toolName: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
      }
    });

    it('should reject invalid amount', () => {
      const result = parseMcpCallEvent({ ...validEvent, amount: 'invalid' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject negative amount', () => {
      const result = parseMcpCallEvent({ ...validEvent, amount: -50 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject invalid currency', () => {
      const result = parseMcpCallEvent({ ...validEvent, currency: 'USDC' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_currency');
      }
    });

    it('should normalize lowercase currency', () => {
      const result = parseMcpCallEvent({ ...validEvent, currency: 'eur' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('EUR');
      }
    });

    it('should validate against allowed servers', () => {
      const config: FluoraConfig = { allowedServers: ['other_server'] };
      const result = parseMcpCallEvent(validEvent, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_server_id');
      }
    });

    it('should validate against allowed tools', () => {
      const config: FluoraConfig = { allowedTools: ['other_tool'] };
      const result = parseMcpCallEvent(validEvent, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_tool_name');
      }
    });

    it('should parse optional fields', () => {
      const eventWithOptional = {
        ...validEvent,
        tenantId: 'tenant_123',
        userId: 'user_456',
        executionMs: 250,
        env: 'test',
        timestamp: '2025-01-01T00:00:00Z',
        marketplace: {
          sellerId: 'seller_789',
          listingId: 'listing_abc',
          commission: 15,
        },
      };
      const result = parseMcpCallEvent(eventWithOptional);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tenantId).toBe('tenant_123');
        expect(result.value.executionMs).toBe(250);
        expect(result.value.marketplace?.sellerId).toBe('seller_789');
      }
    });
  });

  describe('mapToPaymentEvidence', () => {
    it('should map to PaymentEvidence with correct rail', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.rail).toBe('x402.fluora');
    });

    it('should map reference to callId', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.reference).toBe('call_abc123');
    });

    it('should include PEIP-SVC/mcp-call@1 profile', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.profile).toBe('PEIP-SVC/mcp-call@1');
    });

    it('should use default env when not specified', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.env).toBe('live');
    });

    it('should add aggregator for marketplace events', () => {
      const eventWithMarketplace = {
        ...validEvent,
        marketplace: {
          sellerId: 'seller_123',
          commission: 20,
        },
      };
      const evidence = mapToPaymentEvidence(eventWithMarketplace);
      expect(evidence.aggregator).toBe('fluora');
      expect(evidence.splits).toBeDefined();
      expect(evidence.splits![0].party).toBe('seller_123');
      expect(evidence.splits![0].share).toBe(0.8); // 100% - 20% commission
    });

    it('should use default commission when not specified', () => {
      const eventWithMarketplace = {
        ...validEvent,
        marketplace: {
          sellerId: 'seller_123',
        },
      };
      const evidence = mapToPaymentEvidence(eventWithMarketplace);
      expect(evidence.splits![0].share).toBe(0.85); // Default 85% to seller
    });
  });

  describe('fromMcpCallEvent', () => {
    it('should combine parse and map', () => {
      const result = fromMcpCallEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rail).toBe('x402.fluora');
        expect(result.value.amount).toBe(100);
      }
    });

    it('should propagate parse errors', () => {
      const result = fromMcpCallEvent({ amount: 100 });
      expect(result.ok).toBe(false);
    });
  });

  describe('fromWebhookEvent', () => {
    it('should process mcp.call.completed event', () => {
      const webhook = {
        type: 'mcp.call.completed',
        data: validEvent,
      };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(true);
    });

    it('should process payment.captured event', () => {
      const webhook = {
        type: 'payment.captured',
        data: validEvent,
      };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(true);
    });

    it('should reject unsupported event type', () => {
      const webhook = {
        type: 'mcp.call.failed',
        data: validEvent,
      };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('validation_error');
      }
    });

    it('should reject null webhook', () => {
      const result = fromWebhookEvent(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('parse_error');
      }
    });

    it('should reject missing type', () => {
      const webhook = { data: validEvent };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });

    it('should reject missing data', () => {
      const webhook = { type: 'mcp.call.completed' };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });
  });
});
