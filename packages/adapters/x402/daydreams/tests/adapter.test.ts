import { describe, it, expect } from 'vitest';
import {
  parseInferenceEvent,
  mapToPaymentEvidence,
  fromInferenceEvent,
  fromWebhookEvent,
  type DaydreamsInferenceEvent,
  type DaydreamsConfig,
} from '../src/index.js';

describe('x402-daydreams adapter', () => {
  const validEvent: DaydreamsInferenceEvent = {
    eventId: 'evt_abc123',
    modelId: 'gpt-4',
    provider: 'openai',
    amount: 500,
    currency: 'USD',
  };

  describe('parseInferenceEvent', () => {
    it('should parse valid event', () => {
      const result = parseInferenceEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventId).toBe('evt_abc123');
        expect(result.value.modelId).toBe('gpt-4');
        expect(result.value.provider).toBe('openai');
      }
    });

    it('should reject null event', () => {
      const result = parseInferenceEvent(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('parse_error');
      }
    });

    it('should reject missing eventId', () => {
      const result = parseInferenceEvent({ ...validEvent, eventId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
        expect(result.error).toContain('eventId');
      }
    });

    it('should reject missing modelId', () => {
      const result = parseInferenceEvent({ ...validEvent, modelId: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
      }
    });

    it('should reject missing provider', () => {
      const result = parseInferenceEvent({ ...validEvent, provider: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('missing_required_field');
      }
    });

    it('should reject invalid amount (not a number)', () => {
      const result = parseInferenceEvent({ ...validEvent, amount: 'invalid' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject negative amount', () => {
      const result = parseInferenceEvent({ ...validEvent, amount: -100 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject unsafe integer amount', () => {
      const result = parseInferenceEvent({ ...validEvent, amount: Number.MAX_SAFE_INTEGER + 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_amount');
      }
    });

    it('should reject invalid currency', () => {
      const result = parseInferenceEvent({ ...validEvent, currency: 'US' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_currency');
      }
    });

    it('should normalize lowercase currency', () => {
      const result = parseInferenceEvent({ ...validEvent, currency: 'usd' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.currency).toBe('USD');
      }
    });

    it('should validate against allowed providers', () => {
      const config: DaydreamsConfig = { allowedProviders: ['anthropic'] };
      const result = parseInferenceEvent(validEvent, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_provider');
      }
    });

    it('should validate against allowed models', () => {
      const config: DaydreamsConfig = { allowedModels: ['claude-3-opus'] };
      const result = parseInferenceEvent(validEvent, config);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('invalid_model_id');
      }
    });

    it('should parse optional fields', () => {
      const eventWithOptional = {
        ...validEvent,
        inputClass: 'text',
        outputType: 'text',
        tokens: { input: 100, output: 50 },
        sessionId: 'sess_123',
        userId: 'user_456',
        env: 'test',
        timestamp: '2025-01-01T00:00:00Z',
      };
      const result = parseInferenceEvent(eventWithOptional);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.inputClass).toBe('text');
        expect(result.value.outputType).toBe('text');
        expect(result.value.tokens).toEqual({ input: 100, output: 50 });
        expect(result.value.sessionId).toBe('sess_123');
        expect(result.value.env).toBe('test');
      }
    });
  });

  describe('mapToPaymentEvidence', () => {
    it('should map to PaymentEvidence with correct rail', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.rail).toBe('x402.daydreams');
    });

    it('should map reference to eventId', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.reference).toBe('evt_abc123');
    });

    it('should include PEIP-AI/inference@1 profile', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      const ev = evidence.evidence as Record<string, unknown>;
      expect(ev.profile).toBe('PEIP-AI/inference@1');
    });

    it('should use default env when not specified', () => {
      const evidence = mapToPaymentEvidence(validEvent);
      expect(evidence.env).toBe('live');
    });

    it('should use config defaultEnv', () => {
      const config: DaydreamsConfig = { defaultEnv: 'test' };
      const evidence = mapToPaymentEvidence(validEvent, config);
      expect(evidence.env).toBe('test');
    });

    it('should preserve event env over config', () => {
      const eventWithEnv = { ...validEvent, env: 'test' as const };
      const config: DaydreamsConfig = { defaultEnv: 'live' };
      const evidence = mapToPaymentEvidence(eventWithEnv, config);
      expect(evidence.env).toBe('test');
    });
  });

  describe('fromInferenceEvent', () => {
    it('should combine parse and map', () => {
      const result = fromInferenceEvent(validEvent);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rail).toBe('x402.daydreams');
        expect(result.value.amount).toBe(500);
        expect(result.value.currency).toBe('USD');
      }
    });

    it('should propagate parse errors', () => {
      const result = fromInferenceEvent({ amount: 100 });
      expect(result.ok).toBe(false);
    });
  });

  describe('fromWebhookEvent', () => {
    it('should process inference.completed event', () => {
      const webhook = {
        type: 'inference.completed',
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
        type: 'inference.failed',
        data: validEvent,
      };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('validation_error');
      }
    });

    it('should reject missing type', () => {
      const webhook = { data: validEvent };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });

    it('should reject missing data', () => {
      const webhook = { type: 'inference.completed' };
      const result = fromWebhookEvent(webhook);
      expect(result.ok).toBe(false);
    });
  });
});
