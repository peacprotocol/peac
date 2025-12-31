/**
 * @peac/telemetry - Type tests
 */

import { describe, it, expect } from 'vitest';
import type {
  TelemetryDecision,
  PrivacyMode,
  TelemetryConfig,
  TelemetryProvider,
  ReceiptIssuedInput,
  ReceiptVerifiedInput,
  AccessDecisionInput,
  HttpContext,
  PaymentContext,
} from '../src/types.js';

describe('TelemetryDecision', () => {
  it('should accept valid decision values', () => {
    const allow: TelemetryDecision = 'allow';
    const deny: TelemetryDecision = 'deny';
    const unknown: TelemetryDecision = 'unknown';

    expect(allow).toBe('allow');
    expect(deny).toBe('deny');
    expect(unknown).toBe('unknown');
  });
});

describe('PrivacyMode', () => {
  it('should accept valid privacy mode values', () => {
    const strict: PrivacyMode = 'strict';
    const balanced: PrivacyMode = 'balanced';
    const custom: PrivacyMode = 'custom';

    expect(strict).toBe('strict');
    expect(balanced).toBe('balanced');
    expect(custom).toBe('custom');
  });
});

describe('TelemetryConfig', () => {
  it('should require serviceName', () => {
    const config: TelemetryConfig = {
      serviceName: 'my-service',
    };

    expect(config.serviceName).toBe('my-service');
  });

  it('should accept optional privacy mode', () => {
    const config: TelemetryConfig = {
      serviceName: 'my-service',
      privacyMode: 'strict',
    };

    expect(config.privacyMode).toBe('strict');
  });

  it('should accept optional allowlist', () => {
    const config: TelemetryConfig = {
      serviceName: 'my-service',
      privacyMode: 'custom',
      allowAttributes: ['peac.receipt.hash', 'peac.decision'],
    };

    expect(config.allowAttributes).toEqual([
      'peac.receipt.hash',
      'peac.decision',
    ]);
  });

  it('should accept optional redaction hook', () => {
    const redact = (attrs: Record<string, unknown>) => {
      const result = { ...attrs };
      delete result['sensitive'];
      return result;
    };

    const config: TelemetryConfig = {
      serviceName: 'my-service',
      redact,
    };

    expect(config.redact?.({ sensitive: 'data', safe: 'value' })).toEqual({
      safe: 'value',
    });
  });

  it('should accept enableExperimentalGenAI flag', () => {
    const config: TelemetryConfig = {
      serviceName: 'my-service',
      enableExperimentalGenAI: true,
    };

    expect(config.enableExperimentalGenAI).toBe(true);
  });
});

describe('ReceiptIssuedInput', () => {
  it('should require receiptHash', () => {
    const input: ReceiptIssuedInput = {
      receiptHash: 'sha256:abc123',
    };

    expect(input.receiptHash).toBe('sha256:abc123');
  });

  it('should accept optional fields', () => {
    const input: ReceiptIssuedInput = {
      receiptHash: 'sha256:abc123',
      policyHash: 'sha256:policy',
      issuer: 'https://api.example.com',
      kid: '2025-01-01',
      http: { method: 'POST', path: '/api/resource' },
      durationMs: 42,
    };

    expect(input.policyHash).toBe('sha256:policy');
    expect(input.issuer).toBe('https://api.example.com');
    expect(input.kid).toBe('2025-01-01');
    expect(input.http?.method).toBe('POST');
    expect(input.durationMs).toBe(42);
  });
});

describe('ReceiptVerifiedInput', () => {
  it('should require receiptHash and valid', () => {
    const input: ReceiptVerifiedInput = {
      receiptHash: 'sha256:abc123',
      valid: true,
    };

    expect(input.receiptHash).toBe('sha256:abc123');
    expect(input.valid).toBe(true);
  });

  it('should accept reason code for failed verification', () => {
    const input: ReceiptVerifiedInput = {
      receiptHash: 'sha256:abc123',
      valid: false,
      reasonCode: 'SIGNATURE_INVALID',
    };

    expect(input.valid).toBe(false);
    expect(input.reasonCode).toBe('SIGNATURE_INVALID');
  });
});

describe('AccessDecisionInput', () => {
  it('should require decision', () => {
    const input: AccessDecisionInput = {
      decision: 'allow',
    };

    expect(input.decision).toBe('allow');
  });

  it('should accept payment context', () => {
    const input: AccessDecisionInput = {
      decision: 'allow',
      payment: {
        rail: 'stripe',
        amount: 9999,
        currency: 'USD',
      },
    };

    expect(input.payment?.rail).toBe('stripe');
    expect(input.payment?.amount).toBe(9999);
    expect(input.payment?.currency).toBe('USD');
  });
});

describe('HttpContext', () => {
  it('should accept method and path', () => {
    const ctx: HttpContext = {
      method: 'GET',
      path: '/api/v1/resource',
    };

    expect(ctx.method).toBe('GET');
    expect(ctx.path).toBe('/api/v1/resource');
  });

  it('should allow partial context', () => {
    const methodOnly: HttpContext = { method: 'POST' };
    const pathOnly: HttpContext = { path: '/health' };

    expect(methodOnly.method).toBe('POST');
    expect(pathOnly.path).toBe('/health');
  });
});

describe('PaymentContext', () => {
  it('should accept rail, amount, and currency', () => {
    const ctx: PaymentContext = {
      rail: 'x402',
      amount: 1500,
      currency: 'USD',
    };

    expect(ctx.rail).toBe('x402');
    expect(ctx.amount).toBe(1500);
    expect(ctx.currency).toBe('USD');
  });
});

describe('TelemetryProvider', () => {
  it('should define all required methods', () => {
    const provider: TelemetryProvider = {
      onReceiptIssued: () => {},
      onReceiptVerified: () => {},
      onAccessDecision: () => {},
    };

    expect(typeof provider.onReceiptIssued).toBe('function');
    expect(typeof provider.onReceiptVerified).toBe('function');
    expect(typeof provider.onAccessDecision).toBe('function');
  });
});
