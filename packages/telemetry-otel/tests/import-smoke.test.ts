/**
 * Import smoke test -- verifies @peac/telemetry-otel works with only
 * @opentelemetry/api installed (no SDK packages).
 *
 * The OTel API provides no-op implementations by default. This test
 * proves the package does NOT require @opentelemetry/sdk-metrics or
 * @opentelemetry/sdk-trace-base at runtime.
 */

import { describe, it, expect } from 'vitest';

describe('import without SDK', () => {
  it('all public exports resolve', async () => {
    const mod = await import('../src/index.js');

    // Main provider
    expect(typeof mod.createOtelProvider).toBe('function');

    // Trace context
    expect(typeof mod.validateTraceparent).toBe('function');
    expect(typeof mod.parseTraceparent).toBe('function');
    expect(typeof mod.isSampled).toBe('function');
    expect(typeof mod.extractTraceparentFromHeaders).toBe('function');
    expect(typeof mod.extractTracestateFromHeaders).toBe('function');
    expect(typeof mod.createTraceContextExtensions).toBe('function');
    expect(mod.TRACE_CONTEXT_KEYS).toBeDefined();

    // Privacy
    expect(typeof mod.createPrivacyFilter).toBe('function');
    expect(typeof mod.hashIssuer).toBe('function');
    expect(typeof mod.hashKid).toBe('function');
    expect(typeof mod.shouldEmitAttribute).toBe('function');

    // Metrics
    expect(typeof mod.createMetrics).toBe('function');
    expect(typeof mod.recordReceiptIssued).toBe('function');
    expect(typeof mod.recordReceiptVerified).toBe('function');
    expect(typeof mod.recordAccessDecision).toBe('function');
    expect(mod.METRIC_NAMES).toBeDefined();

    // Version constant
    expect(typeof mod.TELEMETRY_OTEL_VERSION).toBe('string');
  });

  it('createOtelProvider works with no-op API (no SDK registered)', async () => {
    // No SDK setup -- the API provides no-op tracer/meter by default
    const { createOtelProvider } = await import('../src/index.js');

    const provider = createOtelProvider({
      serviceName: 'smoke-test',
      privacyMode: 'strict',
    });

    expect(provider).toBeDefined();
    expect(typeof provider.onReceiptIssued).toBe('function');
    expect(typeof provider.onReceiptVerified).toBe('function');
    expect(typeof provider.onAccessDecision).toBe('function');
  });

  it('provider methods do not throw with no-op API', async () => {
    const { createOtelProvider } = await import('../src/index.js');

    const provider = createOtelProvider({
      serviceName: 'smoke-test',
      privacyMode: 'strict',
    });

    // All methods should succeed silently with no-op meter/tracer
    expect(() => {
      provider.onReceiptIssued({
        receiptHash: 'abc123',
        issuer: 'https://example.com',
        kid: 'key-001',
        durationMs: 42,
      });
    }).not.toThrow();

    expect(() => {
      provider.onReceiptVerified({
        receiptHash: 'abc123',
        valid: true,
        issuer: 'https://example.com',
        durationMs: 10,
      });
    }).not.toThrow();

    expect(() => {
      provider.onAccessDecision({
        decision: 'allow',
        receiptHash: 'abc123',
        reasonCode: 'valid_receipt',
      });
    }).not.toThrow();
  });

  it('package.json: SDK packages are devDependencies only', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const pkgPath = resolve(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // @opentelemetry/api must be a peer dependency
    expect(pkg.peerDependencies['@opentelemetry/api']).toBeDefined();

    // SDK packages must NOT be in dependencies or peerDependencies
    const deps = pkg.dependencies ?? {};
    const peerDeps = pkg.peerDependencies ?? {};

    expect(deps['@opentelemetry/sdk-metrics']).toBeUndefined();
    expect(deps['@opentelemetry/sdk-trace-base']).toBeUndefined();
    expect(peerDeps['@opentelemetry/sdk-metrics']).toBeUndefined();
    expect(peerDeps['@opentelemetry/sdk-trace-base']).toBeUndefined();

    // SDK packages should be in devDependencies
    expect(pkg.devDependencies['@opentelemetry/sdk-metrics']).toBeDefined();
    expect(pkg.devDependencies['@opentelemetry/sdk-trace-base']).toBeDefined();
  });
});
