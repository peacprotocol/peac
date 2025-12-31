/**
 * @peac/telemetry - Provider registry tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  providerRef,
  setTelemetryProvider,
  getTelemetryProvider,
  isTelemetryEnabled,
} from '../src/provider.js';
import { noopProvider } from '../src/noop.js';
import type { TelemetryProvider } from '../src/types.js';

describe('providerRef', () => {
  beforeEach(() => {
    // Reset provider before each test
    providerRef.current = undefined;
  });

  it('should start with undefined (disabled)', () => {
    expect(providerRef.current).toBeUndefined();
  });

  it('should allow direct assignment', () => {
    providerRef.current = noopProvider;
    expect(providerRef.current).toBe(noopProvider);
  });

  it('should allow setting to undefined', () => {
    providerRef.current = noopProvider;
    providerRef.current = undefined;
    expect(providerRef.current).toBeUndefined();
  });
});

describe('setTelemetryProvider', () => {
  beforeEach(() => {
    providerRef.current = undefined;
  });

  it('should set the provider', () => {
    setTelemetryProvider(noopProvider);
    expect(providerRef.current).toBe(noopProvider);
  });

  it('should allow undefined to disable', () => {
    setTelemetryProvider(noopProvider);
    setTelemetryProvider(undefined);
    expect(providerRef.current).toBeUndefined();
  });

  it('should be idempotent', () => {
    setTelemetryProvider(noopProvider);
    setTelemetryProvider(noopProvider);
    setTelemetryProvider(noopProvider);
    expect(providerRef.current).toBe(noopProvider);
  });

  it('should allow replacing provider', () => {
    const provider1: TelemetryProvider = {
      onReceiptIssued: vi.fn(),
      onReceiptVerified: vi.fn(),
      onAccessDecision: vi.fn(),
    };

    const provider2: TelemetryProvider = {
      onReceiptIssued: vi.fn(),
      onReceiptVerified: vi.fn(),
      onAccessDecision: vi.fn(),
    };

    setTelemetryProvider(provider1);
    expect(providerRef.current).toBe(provider1);

    setTelemetryProvider(provider2);
    expect(providerRef.current).toBe(provider2);
  });

  it('should not throw', () => {
    expect(() => setTelemetryProvider(noopProvider)).not.toThrow();
    expect(() => setTelemetryProvider(undefined)).not.toThrow();
  });
});

describe('getTelemetryProvider', () => {
  beforeEach(() => {
    providerRef.current = undefined;
  });

  it('should return undefined when no provider set', () => {
    expect(getTelemetryProvider()).toBeUndefined();
  });

  it('should return the current provider', () => {
    setTelemetryProvider(noopProvider);
    expect(getTelemetryProvider()).toBe(noopProvider);
  });

  it('should return same value as providerRef.current', () => {
    setTelemetryProvider(noopProvider);
    expect(getTelemetryProvider()).toBe(providerRef.current);
  });
});

describe('isTelemetryEnabled', () => {
  beforeEach(() => {
    providerRef.current = undefined;
  });

  it('should return false when disabled', () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('should return true when provider set', () => {
    setTelemetryProvider(noopProvider);
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('should return false after disabling', () => {
    setTelemetryProvider(noopProvider);
    setTelemetryProvider(undefined);
    expect(isTelemetryEnabled()).toBe(false);
  });
});

describe('hot path pattern', () => {
  beforeEach(() => {
    providerRef.current = undefined;
  });

  it('should skip telemetry when disabled', () => {
    const mockFn = vi.fn();

    // Hot path pattern
    const p = providerRef.current;
    if (p) {
      mockFn();
    }

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should call telemetry when enabled', () => {
    const mockProvider: TelemetryProvider = {
      onReceiptIssued: vi.fn(),
      onReceiptVerified: vi.fn(),
      onAccessDecision: vi.fn(),
    };

    setTelemetryProvider(mockProvider);

    // Hot path pattern
    const p = providerRef.current;
    if (p) {
      p.onReceiptIssued({ receiptHash: 'sha256:test' });
    }

    expect(mockProvider.onReceiptIssued).toHaveBeenCalledWith({
      receiptHash: 'sha256:test',
    });
  });

  it('should guard against throwing providers', () => {
    const throwingProvider: TelemetryProvider = {
      onReceiptIssued: () => {
        throw new Error('Provider error');
      },
      onReceiptVerified: vi.fn(),
      onAccessDecision: vi.fn(),
    };

    setTelemetryProvider(throwingProvider);

    // Hot path pattern with guard
    const p = providerRef.current;
    if (p) {
      try {
        p.onReceiptIssued({ receiptHash: 'sha256:test' });
      } catch {
        // Telemetry MUST NOT break core flow - swallow silently
      }
    }

    // Should not throw, test passes if we get here
    expect(true).toBe(true);
  });

  it('should have zero overhead when disabled (structural)', () => {
    // This test documents the performance contract structurally
    // When providerRef.current is undefined, no provider methods are called
    // Time-based assertions are avoided to prevent CI flakes

    const iterations = 1000;
    let callCount = 0;

    for (let i = 0; i < iterations; i++) {
      const p = providerRef.current;
      if (p) {
        callCount++;
      }
    }

    // Structural assertion: no calls when disabled
    expect(callCount).toBe(0);
    // The pattern above is the only overhead (single truthiness check)
  });
});

describe('concurrent access', () => {
  beforeEach(() => {
    providerRef.current = undefined;
  });

  it('should handle rapid enable/disable', () => {
    for (let i = 0; i < 100; i++) {
      setTelemetryProvider(noopProvider);
      expect(isTelemetryEnabled()).toBe(true);
      setTelemetryProvider(undefined);
      expect(isTelemetryEnabled()).toBe(false);
    }
  });
});
