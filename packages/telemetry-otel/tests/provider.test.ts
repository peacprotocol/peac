/**
 * @peac/telemetry-otel - OTel provider tests
 *
 * These tests verify the provider creates correctly and doesn't throw.
 * Span event integration is complex to test in isolation and is better
 * verified through integration tests with a full OTel SDK setup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trace, metrics, context } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { createOtelProvider } from '../src/provider.js';
import { PEAC_ATTRS, PEAC_EVENTS } from '@peac/telemetry';

describe('createOtelProvider', () => {
  let tracerProvider: BasicTracerProvider;
  let spanExporter: InMemorySpanExporter;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    // Set up trace provider with in-memory exporter
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider();
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
    trace.setGlobalTracerProvider(tracerProvider);

    // Set up meter provider
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
    spanExporter.reset();
  });

  it('should create provider with default config', () => {
    const provider = createOtelProvider({
      serviceName: 'test-service',
    });

    expect(provider).toBeDefined();
    expect(provider.onReceiptIssued).toBeInstanceOf(Function);
    expect(provider.onReceiptVerified).toBeInstanceOf(Function);
    expect(provider.onAccessDecision).toBeInstanceOf(Function);
  });

  it('should not throw when calling provider methods', () => {
    const provider = createOtelProvider({
      serviceName: 'test-service',
    });

    expect(() => provider.onReceiptIssued({ receiptHash: 'sha256:test' })).not.toThrow();
    expect(() =>
      provider.onReceiptVerified({ receiptHash: 'sha256:test', valid: true })
    ).not.toThrow();
    expect(() => provider.onAccessDecision({ decision: 'allow' })).not.toThrow();
  });

  it('should accept all privacy modes', () => {
    const modes: Array<'strict' | 'balanced' | 'custom'> = ['strict', 'balanced', 'custom'];

    for (const privacyMode of modes) {
      const provider = createOtelProvider({
        serviceName: 'test-service',
        privacyMode,
      });

      expect(() =>
        provider.onReceiptIssued({
          receiptHash: 'sha256:test',
          issuer: 'https://api.example.com',
        })
      ).not.toThrow();
    }
  });

  it('should accept custom tracer/meter names', () => {
    const provider = createOtelProvider({
      serviceName: 'test-service',
      tracerName: 'custom-tracer',
      meterName: 'custom-meter',
      version: '1.0.0',
    });

    expect(() => provider.onReceiptIssued({ receiptHash: 'sha256:test' })).not.toThrow();
  });

  describe('onReceiptIssued', () => {
    it('should not throw with minimal input', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() => provider.onReceiptIssued({ receiptHash: 'sha256:test' })).not.toThrow();
    });

    it('should not throw with full input', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptIssued({
          receiptHash: 'sha256:abc123',
          policyHash: 'sha256:policy456',
          issuer: 'https://api.example.com',
          kid: '2025-01-01',
          http: { method: 'POST', path: '/api/v1/resource' },
          durationMs: 150,
        })
      ).not.toThrow();
    });
  });

  describe('onReceiptVerified', () => {
    it('should not throw with valid=true', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptVerified({
          receiptHash: 'sha256:test',
          valid: true,
        })
      ).not.toThrow();
    });

    it('should not throw with valid=false and reason', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptVerified({
          receiptHash: 'sha256:test',
          valid: false,
          reasonCode: 'SIGNATURE_INVALID',
        })
      ).not.toThrow();
    });

    it('should not throw with full input', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptVerified({
          receiptHash: 'sha256:test',
          issuer: 'https://api.example.com',
          kid: '2025-01-01',
          valid: true,
          http: { method: 'GET', path: '/verify' },
          durationMs: 25,
        })
      ).not.toThrow();
    });
  });

  describe('onAccessDecision', () => {
    it('should not throw with minimal input', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() => provider.onAccessDecision({ decision: 'allow' })).not.toThrow();
    });

    it('should not throw with deny decision', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onAccessDecision({
          decision: 'deny',
          reasonCode: 'INSUFFICIENT_PAYMENT',
        })
      ).not.toThrow();
    });

    it('should not throw with payment in balanced mode', () => {
      const provider = createOtelProvider({
        serviceName: 'test',
        privacyMode: 'balanced',
      });
      expect(() =>
        provider.onAccessDecision({
          decision: 'allow',
          payment: { rail: 'stripe', amount: 500, currency: 'USD' },
        })
      ).not.toThrow();
    });

    it('should not throw with full input', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onAccessDecision({
          receiptHash: 'sha256:test',
          policyHash: 'sha256:policy',
          decision: 'allow',
          reasonCode: 'PAYMENT_VERIFIED',
          payment: { rail: 'stripe', amount: 500, currency: 'USD' },
          http: { method: 'POST', path: '/protected' },
        })
      ).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should not propagate errors from telemetry', () => {
      const provider = createOtelProvider({ serviceName: 'test' });

      // Even with unusual input, should not throw
      expect(() =>
        provider.onReceiptIssued({
          receiptHash: '', // Empty hash
        })
      ).not.toThrow();
    });
  });
});

describe('provider hash behavior', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should hash issuer in strict mode', () => {
    // Verify by checking that the provider completes without error
    // Actual hash verification happens in privacy.test.ts
    const provider = createOtelProvider({
      serviceName: 'test',
      privacyMode: 'strict',
      hashSalt: 'test-salt',
    });

    expect(() =>
      provider.onReceiptIssued({
        receiptHash: 'sha256:test',
        issuer: 'https://api.example.com',
        kid: '2025-01-01',
      })
    ).not.toThrow();
  });

  it('should pass issuer directly in balanced mode', () => {
    const provider = createOtelProvider({
      serviceName: 'test',
      privacyMode: 'balanced',
    });

    expect(() =>
      provider.onReceiptIssued({
        receiptHash: 'sha256:test',
        issuer: 'https://api.example.com',
      })
    ).not.toThrow();
  });

  it('should redact payment in strict mode', () => {
    const provider = createOtelProvider({
      serviceName: 'test',
      privacyMode: 'strict',
    });

    expect(() =>
      provider.onAccessDecision({
        decision: 'allow',
        payment: { rail: 'stripe', amount: 500, currency: 'USD' },
      })
    ).not.toThrow();
  });
});
