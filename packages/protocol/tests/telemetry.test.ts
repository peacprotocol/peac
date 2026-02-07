/**
 * Protocol telemetry integration tests
 *
 * Tests that telemetry hooks are:
 * 1. Called with correct data on successful issue
 * 2. Not called when no hook is provided
 * 3. Non-fatal when hook throws (sync or async)
 */

import { describe, it, expect, vi } from 'vitest';
import { issue } from '../src/issue.js';
import { generateKeypair } from '@peac/crypto';
import type { TelemetryHook } from '../src/telemetry.js';

describe('Protocol Telemetry Hooks', () => {
  describe('issue() telemetry', () => {
    it('should emit telemetry on successful issue', async () => {
      const { privateKey } = await generateKeypair();
      const onReceiptIssued = vi.fn();
      const telemetry: TelemetryHook = { onReceiptIssued };

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
        telemetry,
      });

      expect(result.jws).toBeDefined();
      expect(onReceiptIssued).toHaveBeenCalledTimes(1);

      const call = onReceiptIssued.mock.calls[0][0];
      expect(call.receiptHash).toMatch(/^sha256:[0-9a-f]{16}$/);
      expect(call.issuer).toBe('https://api.example.com');
      expect(call.kid).toBe('2025-01-01');
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should not emit telemetry when hook is not provided', async () => {
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
        // No telemetry option
      });

      expect(result.jws).toBeDefined();
    });

    it('should not throw when telemetry hook throws synchronously', async () => {
      const { privateKey } = await generateKeypair();
      const onReceiptIssued = vi.fn(() => {
        throw new Error('Telemetry sync error');
      });
      const telemetry: TelemetryHook = { onReceiptIssued };

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
        telemetry,
      });

      expect(result.jws).toBeDefined();
    });

    it('should not throw when telemetry hook rejects asynchronously', async () => {
      const { privateKey } = await generateKeypair();
      const onReceiptIssued = vi.fn(() => Promise.reject(new Error('Telemetry async error')));
      const telemetry: TelemetryHook = { onReceiptIssued };

      const result = await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
        telemetry,
      });

      expect(result.jws).toBeDefined();
    });
  });

  describe('hashReceipt format', () => {
    it('should produce consistent hash format', async () => {
      const { privateKey } = await generateKeypair();
      const onReceiptIssued = vi.fn();
      const telemetry: TelemetryHook = { onReceiptIssued };

      await issue({
        iss: 'https://api.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
        telemetry,
      });

      const call = onReceiptIssued.mock.calls[0][0];
      // Hash format: sha256:{16 hex chars}
      expect(call.receiptHash).toMatch(/^sha256:[0-9a-f]{16}$/);
      expect(call.receiptHash.length).toBe(7 + 16); // "sha256:" + 16 hex
    });

    it('should produce different hashes for different receipts', async () => {
      const { privateKey } = await generateKeypair();
      const onReceiptIssued = vi.fn();
      const telemetry: TelemetryHook = { onReceiptIssued };

      await issue({
        iss: 'https://api1.example.com',
        aud: 'https://resource.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'pi_123',
        privateKey,
        kid: '2025-01-01',
        telemetry,
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
        telemetry,
      });

      const hash1 = onReceiptIssued.mock.calls[0][0].receiptHash;
      const hash2 = onReceiptIssued.mock.calls[1][0].receiptHash;

      expect(hash1).not.toBe(hash2);
    });
  });
});
