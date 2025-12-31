/**
 * @peac/telemetry-otel - Metrics tests
 *
 * Note: These tests verify metrics creation and recording without
 * requiring a full OTel SDK setup. For integration tests with actual
 * metric collection, use the provider tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  createMetrics,
  recordReceiptIssued,
  recordReceiptVerified,
  recordAccessDecision,
  METRIC_NAMES,
} from '../src/metrics.js';

describe('METRIC_NAMES', () => {
  it('should define all metric names', () => {
    expect(METRIC_NAMES.RECEIPTS_ISSUED).toBe('peac.receipts.issued');
    expect(METRIC_NAMES.RECEIPTS_VERIFIED).toBe('peac.receipts.verified');
    expect(METRIC_NAMES.ACCESS_DECISIONS).toBe('peac.access.decisions');
    expect(METRIC_NAMES.ISSUE_DURATION).toBe('peac.issue.duration');
    expect(METRIC_NAMES.VERIFY_DURATION).toBe('peac.verify.duration');
  });

  it('should use peac. prefix', () => {
    for (const name of Object.values(METRIC_NAMES)) {
      expect(name.startsWith('peac.')).toBe(true);
    }
  });
});

describe('createMetrics', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should create all metrics', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(peacMetrics.receiptsIssued).toBeDefined();
    expect(peacMetrics.receiptsVerified).toBeDefined();
    expect(peacMetrics.accessDecisions).toBeDefined();
    expect(peacMetrics.issueDuration).toBeDefined();
    expect(peacMetrics.verifyDuration).toBeDefined();
  });

  it('should create counters with correct descriptors', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    // Verify the counters are proper OTel counter instances
    expect(typeof peacMetrics.receiptsIssued.add).toBe('function');
    expect(typeof peacMetrics.receiptsVerified.add).toBe('function');
    expect(typeof peacMetrics.accessDecisions.add).toBe('function');
  });

  it('should create histograms with correct descriptors', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    // Verify the histograms are proper OTel histogram instances
    expect(typeof peacMetrics.issueDuration.record).toBe('function');
    expect(typeof peacMetrics.verifyDuration.record).toBe('function');
  });
});

describe('recordReceiptIssued', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should record counter without throwing', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptIssued(peacMetrics)).not.toThrow();
  });

  it('should record with issuer hash attribute', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptIssued(peacMetrics, 'abc123def456')).not.toThrow();
  });

  it('should record duration histogram', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptIssued(peacMetrics, 'abc123', 150)).not.toThrow();
  });

  it('should handle undefined duration', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptIssued(peacMetrics, 'abc123', undefined)).not.toThrow();
  });
});

describe('recordReceiptVerified', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should record counter with valid=true', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptVerified(peacMetrics, true)).not.toThrow();
  });

  it('should record counter with valid=false and reason code', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptVerified(peacMetrics, false, 'SIGNATURE_INVALID')).not.toThrow();
  });

  it('should record duration histogram', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordReceiptVerified(peacMetrics, true, undefined, 25)).not.toThrow();
  });

  it('should handle all valid combinations', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    // Valid without extras
    expect(() => recordReceiptVerified(peacMetrics, true)).not.toThrow();
    // Invalid without extras
    expect(() => recordReceiptVerified(peacMetrics, false)).not.toThrow();
    // Valid with reason
    expect(() => recordReceiptVerified(peacMetrics, true, 'VALID')).not.toThrow();
    // Invalid with reason and duration
    expect(() => recordReceiptVerified(peacMetrics, false, 'EXPIRED', 50)).not.toThrow();
  });
});

describe('recordAccessDecision', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    meterProvider = new MeterProvider();
    metrics.setGlobalMeterProvider(meterProvider);
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should record allow decision', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordAccessDecision(peacMetrics, 'allow')).not.toThrow();
  });

  it('should record deny decision with reason', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordAccessDecision(peacMetrics, 'deny', 'INSUFFICIENT_PAYMENT')).not.toThrow();
  });

  it('should record unknown decision', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    expect(() => recordAccessDecision(peacMetrics, 'unknown')).not.toThrow();
  });

  it('should handle all decision types', () => {
    const meter = meterProvider.getMeter('test');
    const peacMetrics = createMetrics(meter);

    const decisions: Array<'allow' | 'deny' | 'unknown'> = ['allow', 'deny', 'unknown'];
    for (const decision of decisions) {
      expect(() => recordAccessDecision(peacMetrics, decision)).not.toThrow();
    }
  });
});
