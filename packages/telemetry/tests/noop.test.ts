/**
 * @peac/telemetry - No-op provider tests
 */

import { describe, it, expect, vi } from 'vitest';
import { noopProvider } from '../src/noop.js';
import type { TelemetryProvider } from '../src/types.js';

describe('noopProvider', () => {
  it('should implement TelemetryProvider interface', () => {
    const provider: TelemetryProvider = noopProvider;

    expect(typeof provider.onReceiptIssued).toBe('function');
    expect(typeof provider.onReceiptVerified).toBe('function');
    expect(typeof provider.onAccessDecision).toBe('function');
  });

  it('should not throw on onReceiptIssued', () => {
    expect(() =>
      noopProvider.onReceiptIssued({
        receiptHash: 'sha256:test',
      })
    ).not.toThrow();
  });

  it('should not throw on onReceiptVerified', () => {
    expect(() =>
      noopProvider.onReceiptVerified({
        receiptHash: 'sha256:test',
        valid: true,
      })
    ).not.toThrow();
  });

  it('should not throw on onAccessDecision', () => {
    expect(() =>
      noopProvider.onAccessDecision({
        decision: 'allow',
      })
    ).not.toThrow();
  });

  it('should return undefined from all methods', () => {
    const issued = noopProvider.onReceiptIssued({
      receiptHash: 'sha256:test',
    });
    const verified = noopProvider.onReceiptVerified({
      receiptHash: 'sha256:test',
      valid: true,
    });
    const decision = noopProvider.onAccessDecision({
      decision: 'allow',
    });

    expect(issued).toBeUndefined();
    expect(verified).toBeUndefined();
    expect(decision).toBeUndefined();
  });

  it('should handle complex input without errors', () => {
    expect(() =>
      noopProvider.onReceiptIssued({
        receiptHash: 'sha256:complex',
        policyHash: 'sha256:policy',
        issuer: 'https://api.example.com',
        kid: '2025-01-01T00:00:00Z',
        http: { method: 'POST', path: '/api/v1/resource' },
        durationMs: 150,
      })
    ).not.toThrow();

    expect(() =>
      noopProvider.onReceiptVerified({
        receiptHash: 'sha256:complex',
        issuer: 'https://api.example.com',
        kid: '2025-01-01',
        valid: false,
        reasonCode: 'SIGNATURE_INVALID',
        http: { method: 'GET', path: '/verify' },
        durationMs: 25,
      })
    ).not.toThrow();

    expect(() =>
      noopProvider.onAccessDecision({
        receiptHash: 'sha256:complex',
        policyHash: 'sha256:policy',
        decision: 'deny',
        reasonCode: 'INSUFFICIENT_PAYMENT',
        payment: { rail: 'stripe', amount: 500, currency: 'USD' },
        http: { method: 'POST', path: '/protected' },
      })
    ).not.toThrow();
  });

  it('should be usable as default provider', () => {
    // Simulate setting as default
    let currentProvider: TelemetryProvider | undefined = noopProvider;

    // Should work without errors
    currentProvider.onReceiptIssued({ receiptHash: 'sha256:test' });
    currentProvider.onReceiptVerified({ receiptHash: 'sha256:test', valid: true });
    currentProvider.onAccessDecision({ decision: 'allow' });

    // Should be replaceable
    currentProvider = undefined;
    expect(currentProvider).toBeUndefined();
  });
});
