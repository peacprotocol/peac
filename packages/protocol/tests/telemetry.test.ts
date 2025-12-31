/**
 * Protocol telemetry integration tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { issue } from '../src/issue.js';
import { setTelemetryProvider, type TelemetryProvider } from '@peac/telemetry';
import { generateKeypair } from '@peac/crypto';

describe('Protocol Telemetry Hooks', () => {
  let mockProvider: TelemetryProvider;
  let onReceiptIssued: ReturnType<typeof vi.fn>;
  let onReceiptVerified: ReturnType<typeof vi.fn>;
  let onAccessDecision: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onReceiptIssued = vi.fn();
    onReceiptVerified = vi.fn();
    onAccessDecision = vi.fn();

    mockProvider = {
      onReceiptIssued,
      onReceiptVerified,
      onAccessDecision,
    };

    setTelemetryProvider(mockProvider);
  });

  afterEach(() => {
    setTelemetryProvider(undefined);
  });

  describe('issue() telemetry', () => {
    it('should emit telemetry on successful issue', async () => {
      const { privateKey } = await generateKeypair();

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
      });

      expect(result.jws).toBeDefined();
      expect(onReceiptIssued).toHaveBeenCalledTimes(1);

      const call = onReceiptIssued.mock.calls[0][0];
      expect(call.receiptHash).toMatch(/^sha256:[0-9a-f]{16}$/);
      expect(call.issuer).toBe('https://api.example.com');
      expect(call.kid).toBe('2025-01-01');
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should not emit telemetry when provider is not set', async () => {
      const { privateKey } = await generateKeypair();
      setTelemetryProvider(undefined);

      await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
      });

      expect(onReceiptIssued).not.toHaveBeenCalled();
    });

    it('should not throw when telemetry throws', async () => {
      const { privateKey } = await generateKeypair();

      onReceiptIssued.mockImplementation(() => {
        throw new Error('Telemetry error');
      });

      // Should not throw
      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
      });

      expect(result.jws).toBeDefined();
    });
  });

  describe('hashReceipt format', () => {
    it('should produce consistent hash format', async () => {
      const { privateKey } = await generateKeypair();

      await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
      });

      const call = onReceiptIssued.mock.calls[0][0];
      // Hash format: sha256:{16 hex chars}
      expect(call.receiptHash).toMatch(/^sha256:[0-9a-f]{16}$/);
      expect(call.receiptHash.length).toBe(7 + 16); // "sha256:" + 16 hex
    });

    it('should produce different hashes for different receipts', async () => {
      const { privateKey } = await generateKeypair();

      await issue({
        iss: 'https://api1.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
      });

      await issue({
        iss: 'https://api2.example.com',
        aud: 'https://resource.example.com',
        amt: 200,
        cur: 'EUR',
        rail: 'stripe',
        reference: 'pi_456',
        privateKey,
        kid: '2025-01-02',
      });

      const hash1 = onReceiptIssued.mock.calls[0][0].receiptHash;
      const hash2 = onReceiptIssued.mock.calls[1][0].receiptHash;

      expect(hash1).not.toBe(hash2);
    });
  });
});
