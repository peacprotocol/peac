/**
 * @peac/telemetry - Attribute constants tests
 */

import { describe, it, expect } from 'vitest';
import {
  PEAC_ATTRS,
  PEAC_EVENTS,
  PEAC_METRICS,
  TRACE_CONTEXT_EXTENSIONS,
} from '../src/attributes.js';

describe('PEAC_ATTRS', () => {
  it('should define core attributes', () => {
    expect(PEAC_ATTRS.VERSION).toBe('peac.version');
    expect(PEAC_ATTRS.EVENT).toBe('peac.event');
    expect(PEAC_ATTRS.RECEIPT_HASH).toBe('peac.receipt.hash');
    expect(PEAC_ATTRS.POLICY_HASH).toBe('peac.policy.hash');
    expect(PEAC_ATTRS.DECISION).toBe('peac.decision');
    expect(PEAC_ATTRS.REASON_CODE).toBe('peac.reason_code');
    expect(PEAC_ATTRS.ISSUER).toBe('peac.issuer');
    expect(PEAC_ATTRS.ISSUER_HASH).toBe('peac.issuer_hash');
    expect(PEAC_ATTRS.KID).toBe('peac.kid');
    expect(PEAC_ATTRS.VALID).toBe('peac.valid');
  });

  it('should use stable OTel semconv for HTTP', () => {
    // These are stable OTel semantic conventions
    expect(PEAC_ATTRS.HTTP_METHOD).toBe('http.request.method');
    expect(PEAC_ATTRS.HTTP_PATH).toBe('url.path');
  });

  it('should define HTTP hash attributes', () => {
    expect(PEAC_ATTRS.HTTP_HOST_HASH).toBe('peac.http.host_hash');
    expect(PEAC_ATTRS.HTTP_CLIENT_HASH).toBe('peac.http.client_hash');
  });

  it('should define payment attributes', () => {
    expect(PEAC_ATTRS.PAYMENT_RAIL).toBe('peac.payment.rail');
    expect(PEAC_ATTRS.PAYMENT_AMOUNT).toBe('peac.payment.amount');
    expect(PEAC_ATTRS.PAYMENT_CURRENCY).toBe('peac.payment.currency');
  });

  it('should define duration attribute', () => {
    expect(PEAC_ATTRS.DURATION_MS).toBe('peac.duration_ms');
  });

  it('should be readonly (const assertion)', () => {
    // TypeScript ensures this at compile time
    // Runtime test: object should be frozen-like
    const keys = Object.keys(PEAC_ATTRS);
    expect(keys.length).toBeGreaterThan(0);

    // All values should be strings
    for (const key of keys) {
      expect(typeof PEAC_ATTRS[key as keyof typeof PEAC_ATTRS]).toBe('string');
    }
  });

  it('should use peac. prefix consistently', () => {
    const peacPrefixed = Object.values(PEAC_ATTRS).filter((v) => v.startsWith('peac.'));
    const otherPrefixed = Object.values(PEAC_ATTRS).filter((v) => !v.startsWith('peac.'));

    // Most should be peac. prefixed
    expect(peacPrefixed.length).toBeGreaterThan(otherPrefixed.length);

    // HTTP should use standard OTel conventions
    expect(otherPrefixed).toContain('http.request.method');
    expect(otherPrefixed).toContain('url.path');
  });
});

describe('PEAC_EVENTS', () => {
  it('should define all event names', () => {
    expect(PEAC_EVENTS.RECEIPT_ISSUED).toBe('peac.receipt.issued');
    expect(PEAC_EVENTS.RECEIPT_VERIFIED).toBe('peac.receipt.verified');
    expect(PEAC_EVENTS.ACCESS_DECISION).toBe('peac.access.decision');
  });

  it('should use peac. prefix', () => {
    for (const event of Object.values(PEAC_EVENTS)) {
      expect(event.startsWith('peac.')).toBe(true);
    }
  });
});

describe('PEAC_METRICS', () => {
  it('should define counter metrics', () => {
    expect(PEAC_METRICS.RECEIPTS_ISSUED).toBe('peac.receipts.issued');
    expect(PEAC_METRICS.RECEIPTS_VERIFIED).toBe('peac.receipts.verified');
    expect(PEAC_METRICS.ACCESS_DECISIONS).toBe('peac.access.decisions');
  });

  it('should define histogram metrics', () => {
    expect(PEAC_METRICS.ISSUE_DURATION).toBe('peac.issue.duration');
    expect(PEAC_METRICS.VERIFY_DURATION).toBe('peac.verify.duration');
  });

  it('should use peac. prefix', () => {
    for (const metric of Object.values(PEAC_METRICS)) {
      expect(metric.startsWith('peac.')).toBe(true);
    }
  });
});

describe('TRACE_CONTEXT_EXTENSIONS', () => {
  it('should use w3c/ namespace (vendor-neutral)', () => {
    expect(TRACE_CONTEXT_EXTENSIONS.TRACEPARENT).toBe('w3c/traceparent');
    expect(TRACE_CONTEXT_EXTENSIONS.TRACESTATE).toBe('w3c/tracestate');
  });

  it('should match extension key pattern', () => {
    // Pattern: ^[a-z0-9_.-]+/[a-z0-9_.-]+$
    const pattern = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;

    expect(pattern.test(TRACE_CONTEXT_EXTENSIONS.TRACEPARENT)).toBe(true);
    expect(pattern.test(TRACE_CONTEXT_EXTENSIONS.TRACESTATE)).toBe(true);
  });

  it('should NOT use io.opentelemetry namespace', () => {
    // Vendor-neutral: w3c/ not io.opentelemetry/
    for (const key of Object.values(TRACE_CONTEXT_EXTENSIONS)) {
      expect(key.startsWith('io.opentelemetry')).toBe(false);
    }
  });
});
