import { describe, it, expect } from 'vitest';
import {
  parseAccessEvent,
  mapToPaymentEvidence,
  fromAccessEvent,
  fromWebhookEvent,
  type PinataAccessEvent,
  type PinataConfig,
} from '../src/index.js';

describe('x402-pinata adapter', () => {
  const validEvent: PinataAccessEvent = {
    accessId: 'acc_abc123',
    cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    amount: 250,
    currency: 'USD',
  };

  const validCIDv1Event: PinataAccessEvent = {
    accessId: 'acc_xyz789',
    cid: 'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
    amount: 100,
    currency: 'USD',
  };

  describe('parseAccessEvent', () => {
    it('should parse valid event with CIDv0', () => {
      const result = parseAccessEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.accessId).toBe('acc_abc123');
        expect(result.value.cid).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
      }
    });

    it('should parse valid event with CIDv1', () => {
      const result = parseAccessEvent(validCIDv1Event);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cid).toContain('bafy');
      }
    });

    it('should reject null event', () => {
      const result = parseAccessEvent(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('parse_error');
      }
    });

    it('should reject missing accessId', () => {
      const result = parseAccessEvent({ ...validEvent, accessId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
        expect(result.error).toContain('accessId');
      }
    });

    it('should reject missing cid', () => {
      const result = parseAccessEvent({ ...validEvent, cid: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
      }
    });

    it('should reject invalid cid format', () => {
      const result = parseAccessEvent({ ...validEvent, cid: 'invalid-cid' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_cid');
      }
    });

    it('should reject invalid amount', () => {
      const result = parseAccessEvent({ ...validEvent, amount: 'invalid' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject negative amount', () => {
      const result = parseAccessEvent({ ...validEvent, amount: -100 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject invalid currency', () => {
      const result = parseAccessEvent({ ...validEvent, currency: 'BT' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_currency');
      }
    });

    it('should normalize lowercase currency', () => {
      const result = parseAccessEvent({ ...validEvent, currency: 'btc' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('BTC');
      }
    });

    it('should reject invalid visibility', () => {
      const result = parseAccessEvent({ ...validEvent, visibility: 'restricted' as any });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_visibility');
      }
    });

    it('should validate against allowed gateways', () => {
      const eventWithGateway = { ...validEvent, gateway: 'my-gateway.pinata.cloud' };
      const config: PinataConfig = { allowedGateways: ['other-gateway.pinata.cloud'] };
      const result = parseAccessEvent(eventWithGateway, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('validation_error');
      }
    });

    it('should parse optional fields', () => {
      const eventWithOptional = {
        ...validEvent,
        visibility: 'private',
        gateway: 'my-gateway.pinata.cloud',
        userId: 'user_456',
        contentType: 'application/json',
        contentSize: 1024,
        expiresAt: '2025-12-31T23:59:59Z',
        ttl: 3600,
        env: 'test',
        timestamp: '2025-01-01T00:00:00Z',
      };
      const result = parseAccessEvent(eventWithOptional);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.visibility).toBe('private');
        expect(result.value.contentType).toBe('application/json');
        expect(result.value.contentSize).toBe(1024);
        expect(result.value.ttl).toBe(3600);
      }
    });
  });

  describe('mapToPaymentEvidence', () => {
    it('should map to PaymentEvidence with correct rail', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.rail).toBe('x402.pinata');
    });

    it('should map reference to accessId', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.reference).toBe('acc_abc123');
    });

    it('should include PEIP-OBJ/private@1 profile', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.profile).toBe('PEIP-OBJ/private@1');
    });

    it('should set store to ipfs', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.store).toBe('ipfs');
    });

    it('should set object_id to cid', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.object_id).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    });

    it('should use default visibility private', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.visibility).toBe('private');
    });

    it('should use config defaultVisibility', () => {
      const config: PinataConfig = { defaultVisibility: 'public' };
      const evidence = mapToPaymentEvidence(validEvent, config);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.visibility).toBe('public');
    });

    it('should preserve event visibility over config', () => {
      const eventWithVisibility = { ...validEvent, visibility: 'public' as const };
      const config: PinataConfig = { defaultVisibility: 'private' };
      const evidence = mapToPaymentEvidence(eventWithVisibility, config);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.visibility).toBe('public');
    });

    it('should use default env when not specified', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.env).toBe('live');
    });
  });

  describe('fromAccessEvent', () => {
    it('should combine parse and map', () => {
      const result = fromAccessEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rail).toBe('x402.pinata');
        expect(result.value.amount).toBe(250);
      }
    });

    it('should propagate parse errors', () => {
      const result = fromAccessEvent({ amount: 100 });
      expect(result.ok).toBe(false);
    });
  });

  describe('fromWebhookEvent', () => {
    it('should process access.granted event', () => {
      const webhook = {
        type: 'access.granted',
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
        type: 'access.expired',
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
    });

    it('should reject missing type', () => {
      const webhook = { data: validEvent };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });

    it('should reject missing data', () => {
      const webhook = { type: 'access.granted' };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });
  });
});
