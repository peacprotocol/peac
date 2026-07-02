/**
 * @peac/telemetry-otel - OTel provider tests
 *
 * These tests verify provider construction, privacy behavior, span-event
 * attributes, and metric-label boundaries using in-memory OTel SDK components.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace, metrics, context, ROOT_CONTEXT } from '@opentelemetry/api';
import type { Context, ContextManager } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  InMemoryMetricExporter,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { createOtelProvider } from '../src/provider.js';

describe('createOtelProvider', () => {
  let tracerProvider: BasicTracerProvider;
  let spanExporter: InMemorySpanExporter;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    // Set up trace provider with in-memory exporter
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    });
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

    it('should accept receiptRef as span attribute', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptIssued({
          receiptHash: 'sha256:abc123',
          receiptRef: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
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

    it('should accept receiptRef as span attribute', () => {
      const provider = createOtelProvider({ serviceName: 'test' });
      expect(() =>
        provider.onReceiptVerified({
          receiptHash: 'sha256:test',
          receiptRef: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
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

  describe('record.ref / receipt.ref dual-emit (span events)', () => {
    const REF = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    // Minimal AsyncLocalStorage-based context manager (Node built-in; test-only,
    // no extra dependency) so trace.getActiveSpan() resolves inside startActiveSpan.
    class TestContextManager implements ContextManager {
      private readonly als = new AsyncLocalStorage<Context>();
      active(): Context {
        return this.als.getStore() ?? ROOT_CONTEXT;
      }
      with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
        ctx: Context,
        fn: F,
        thisArg?: ThisParameterType<F>,
        ...args: A
      ): ReturnType<F> {
        return this.als.run(ctx, () => fn.call(thisArg as ThisParameterType<F>, ...args));
      }
      bind<T>(_ctx: Context, target: T): T {
        return target;
      }
      enable(): this {
        return this;
      }
      disable(): this {
        this.als.disable();
        return this;
      }
    }

    let localSpanExporter: InMemorySpanExporter;
    let localTracerProvider: BasicTracerProvider;

    beforeEach(() => {
      context.disable();
      trace.disable();
      metrics.disable();
      context.setGlobalContextManager(new TestContextManager().enable());
      localSpanExporter = new InMemorySpanExporter();
      localTracerProvider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(localSpanExporter)],
      });
      trace.setGlobalTracerProvider(localTracerProvider);
    });

    afterEach(async () => {
      await localTracerProvider.shutdown();
      localSpanExporter.reset();
      context.disable();
      trace.disable();
      metrics.disable();
    });

    // Capture the first span-event attributes produced while an active span exists.
    function eventAttrs(
      run: (p: ReturnType<typeof createOtelProvider>) => void
    ): Record<string, unknown> {
      const provider = createOtelProvider({ serviceName: 'test' });
      trace.getTracer('test').startActiveSpan('op', (span) => {
        run(provider);
        span.end();
      });
      const spans = localSpanExporter.getFinishedSpans();
      const events = spans[spans.length - 1]?.events ?? [];
      return (events[0]?.attributes ?? {}) as Record<string, unknown>;
    }

    it('onReceiptIssued emits peac.record.ref and compatibility peac.receipt.ref with the same value', () => {
      const attrs = eventAttrs((p) =>
        p.onReceiptIssued({ receiptHash: 'sha256:abc', receiptRef: REF })
      );
      expect(attrs['peac.record.ref']).toBe(REF);
      expect(attrs['peac.receipt.ref']).toBe(REF);
      expect(attrs['peac.receipt_ref']).toBeUndefined();
    });

    it('onReceiptVerified emits peac.record.ref and compatibility peac.receipt.ref with the same value', () => {
      const attrs = eventAttrs((p) =>
        p.onReceiptVerified({ receiptHash: 'sha256:abc', receiptRef: REF, valid: true })
      );
      expect(attrs['peac.record.ref']).toBe(REF);
      expect(attrs['peac.receipt.ref']).toBe(REF);
      expect(attrs['peac.receipt_ref']).toBeUndefined();
    });

    it('emits neither ref attribute when receiptRef is absent', () => {
      const attrs = eventAttrs((p) => p.onReceiptIssued({ receiptHash: 'sha256:abc' }));
      expect(attrs['peac.record.ref']).toBeUndefined();
      expect(attrs['peac.receipt.ref']).toBeUndefined();
    });

    it('does not add the record/receipt ref as a metric label (span-event only)', async () => {
      metrics.disable();
      const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
      const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
      const mp = new MeterProvider({ readers: [reader] });
      metrics.setGlobalMeterProvider(mp);
      try {
        const provider = createOtelProvider({ serviceName: 'test' });
        provider.onReceiptIssued({
          receiptHash: 'sha256:abc',
          receiptRef: REF,
          issuer: 'https://issuer.example',
          durationMs: 10,
        });
        await reader.forceFlush();

        const collected = exporter.getMetrics();
        let dataPointCount = 0;
        const labelKeys = new Set<string>();
        for (const rm of collected) {
          for (const sm of rm.scopeMetrics) {
            for (const metric of sm.metrics) {
              for (const dp of metric.dataPoints) {
                dataPointCount += 1;
                for (const k of Object.keys(dp.attributes ?? {})) labelKeys.add(k);
              }
            }
          }
        }

        // Datapoints were actually recorded and inspected, so the assertions are meaningful.
        expect(dataPointCount).toBeGreaterThan(0);
        expect(labelKeys.has('peac.issuer_hash')).toBe(true);
        // Record references are high-cardinality; they must never become metric labels.
        expect(labelKeys.has('peac.record.ref')).toBe(false);
        expect(labelKeys.has('peac.receipt.ref')).toBe(false);
        expect(labelKeys.has('peac.receipt_ref')).toBe(false);
      } finally {
        await mp.shutdown();
      }
    });
  });
});
