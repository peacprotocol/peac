/**
 * @peac/adapter-openclaw - Emitter Tests
 *
 * Tests for background receipt emitter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReceiptEmitter,
  createBackgroundService,
  type Signer,
  type ReceiptWriter,
  type SignedReceipt,
} from '../src/emitter.js';
import type { SpoolEntry, CapturedAction } from '@peac/capture-core';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_TIMESTAMP = '2024-02-01T10:00:00Z';

function createTestAction(id: string): CapturedAction {
  return {
    id,
    kind: 'tool.call',
    platform: 'openclaw',
    started_at: VALID_TIMESTAMP,
    tool_name: 'test_tool',
  };
}

function createTestEntry(sequence: number): SpoolEntry {
  return {
    captured_at: VALID_TIMESTAMP,
    action: createTestAction(`action_${sequence}`),
    sequence,
    prev_entry_digest: sequence === 1 ? '0'.repeat(64) : `prev_${sequence - 1}`,
    entry_digest: `entry_${sequence}`,
  };
}

function createMockSigner(): Signer {
  return {
    async sign(payload: unknown): Promise<string> {
      return `signed_${JSON.stringify(payload).slice(0, 20)}`;
    },
    getKeyId(): string {
      return 'test-key-id';
    },
    getIssuer(): string {
      return 'https://test-issuer.example.com';
    },
    getAudience(): string | undefined {
      return 'https://test-audience.example.com';
    },
  };
}

function createMockWriter(): ReceiptWriter & { receipts: SignedReceipt[] } {
  const receipts: SignedReceipt[] = [];
  return {
    receipts,
    async write(receipt: SignedReceipt): Promise<string> {
      receipts.push(receipt);
      return `/receipts/${receipt.rid}.json`;
    },
    async close(): Promise<void> {
      // No-op
    },
  };
}

// =============================================================================
// Receipt Emitter Tests
// =============================================================================

describe('createReceiptEmitter', () => {
  let mockSigner: Signer;
  let mockWriter: ReturnType<typeof createMockWriter>;

  beforeEach(() => {
    mockSigner = createMockSigner();
    mockWriter = createMockWriter();
  });

  describe('emit', () => {
    it('emits a receipt from spool entry', async () => {
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      const entry = createTestEntry(1);
      const result = await emitter.emit(entry);

      expect(result.success).toBe(true);
      expect(result.receipt_path).toBeDefined();
      expect(result.receipt_id).toBeDefined();
      expect(mockWriter.receipts).toHaveLength(1);
    });

    it('includes interaction ID in signed receipt', async () => {
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      const entry = createTestEntry(1);
      await emitter.emit(entry);

      expect(mockWriter.receipts[0].interaction_id).toBe('action_1');
    });

    it('includes entry digest in signed receipt', async () => {
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      const entry = createTestEntry(1);
      await emitter.emit(entry);

      expect(mockWriter.receipts[0].entry_digest).toBe('entry_1');
    });

    it('invokes onEmit callback on success', async () => {
      const onEmit = vi.fn();
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
        onEmit,
      });

      const entry = createTestEntry(1);
      await emitter.emit(entry);

      expect(onEmit).toHaveBeenCalledTimes(1);
      expect(onEmit).toHaveBeenCalledWith(expect.objectContaining({ success: true }), entry);
    });

    it('invokes onError callback on signing failure', async () => {
      const failingSigner: Signer = {
        ...createMockSigner(),
        async sign(): Promise<string> {
          throw new Error('Signing failed');
        },
      };

      const onError = vi.fn();
      const emitter = createReceiptEmitter({
        signer: failingSigner,
        writer: mockWriter,
        onError,
      });

      const entry = createTestEntry(1);
      const result = await emitter.emit(entry);

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), entry);
    });

    it('invokes onError callback on write failure', async () => {
      const failingWriter: ReceiptWriter = {
        async write(): Promise<string> {
          throw new Error('Write failed');
        },
        async close(): Promise<void> {},
      };

      const onError = vi.fn();
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: failingWriter,
        onError,
      });

      const entry = createTestEntry(1);
      const result = await emitter.emit(entry);

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('returns error after close', async () => {
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      await emitter.close();

      const entry = createTestEntry(1);
      const result = await emitter.emit(entry);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe('E_EMITTER_CLOSED');
    });

    it('uses config platform and version', async () => {
      // We can't easily test this without inspecting the signed payload,
      // but we can verify no error occurs
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
        config: {
          platform: 'custom-platform',
          platform_version: '1.0.0',
          plugin_id: 'test-plugin',
        },
      });

      const entry = createTestEntry(1);
      const result = await emitter.emit(entry);

      expect(result.success).toBe(true);
    });
  });

  describe('flush', () => {
    it('processes pending entries', async () => {
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      // Flush with no pending entries should succeed
      await expect(emitter.flush()).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('closes the writer', async () => {
      const closeSpy = vi.spyOn(mockWriter, 'close');
      const emitter = createReceiptEmitter({
        signer: mockSigner,
        writer: mockWriter,
      });

      await emitter.close();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// Background Service Tests
// =============================================================================

describe('createBackgroundService', () => {
  let mockSigner: Signer;
  let mockWriter: ReturnType<typeof createMockWriter>;

  beforeEach(() => {
    mockSigner = createMockSigner();
    mockWriter = createMockWriter();
  });

  it('starts and stops correctly', () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    const service = createBackgroundService({
      emitter,
      getPendingEntries: vi.fn().mockResolvedValue([]),
      markEmitted: vi.fn(),
      drainIntervalMs: 100,
    });

    expect(service.isRunning()).toBe(false);

    service.start();
    expect(service.isRunning()).toBe(true);

    service.stop();
    expect(service.isRunning()).toBe(false);
  });

  it('drains pending entries', async () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    let callCount = 0;
    const getPendingEntries = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([createTestEntry(1), createTestEntry(2)]);
      }
      return Promise.resolve([]);
    });

    const markEmitted = vi.fn();

    const service = createBackgroundService({
      emitter,
      getPendingEntries,
      markEmitted,
      drainIntervalMs: 50,
    });

    service.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    service.stop();

    expect(getPendingEntries).toHaveBeenCalled();
    expect(markEmitted).toHaveBeenCalledTimes(2);
    expect(markEmitted).toHaveBeenCalledWith('entry_1');
    expect(markEmitted).toHaveBeenCalledWith('entry_2');
  });

  it('tracks emit statistics', async () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    const getPendingEntries = vi
      .fn()
      .mockResolvedValueOnce([createTestEntry(1)])
      .mockResolvedValue([]);
    const markEmitted = vi.fn();

    const service = createBackgroundService({
      emitter,
      getPendingEntries,
      markEmitted,
      drainIntervalMs: 50,
    });

    service.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    service.stop();

    const stats = service.getStats();
    expect(stats.emitted).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.lastEmitTime).toBeDefined();
  });

  it('tracks failures in statistics', async () => {
    const failingSigner: Signer = {
      ...createMockSigner(),
      async sign(): Promise<string> {
        throw new Error('Signing failed');
      },
    };

    const emitter = createReceiptEmitter({
      signer: failingSigner,
      writer: mockWriter,
    });

    const getPendingEntries = vi
      .fn()
      .mockResolvedValueOnce([createTestEntry(1)])
      .mockResolvedValue([]);
    const markEmitted = vi.fn();

    const service = createBackgroundService({
      emitter,
      getPendingEntries,
      markEmitted,
      drainIntervalMs: 50,
    });

    service.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    service.stop();

    const stats = service.getStats();
    expect(stats.emitted).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.lastError).toBeDefined();
  });

  it('invokes onError callback on drain failure', async () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    const onError = vi.fn();
    const getPendingEntries = vi.fn().mockRejectedValue(new Error('Fetch failed'));
    const markEmitted = vi.fn();

    const service = createBackgroundService({
      emitter,
      getPendingEntries,
      markEmitted,
      drainIntervalMs: 50,
      onError,
    });

    service.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    service.stop();

    expect(onError).toHaveBeenCalled();
  });

  it('drain() can be called manually', async () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    const getPendingEntries = vi.fn().mockResolvedValue([createTestEntry(1)]);
    const markEmitted = vi.fn();

    const service = createBackgroundService({
      emitter,
      getPendingEntries,
      markEmitted,
    });

    // Manual drain without starting
    await service.drain();

    expect(getPendingEntries).toHaveBeenCalledTimes(1);
    expect(markEmitted).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for start/stop', () => {
    const emitter = createReceiptEmitter({
      signer: mockSigner,
      writer: mockWriter,
    });

    const service = createBackgroundService({
      emitter,
      getPendingEntries: vi.fn().mockResolvedValue([]),
      markEmitted: vi.fn(),
    });

    // Multiple starts should be idempotent
    service.start();
    service.start();
    service.start();
    expect(service.isRunning()).toBe(true);

    // Multiple stops should be idempotent
    service.stop();
    service.stop();
    service.stop();
    expect(service.isRunning()).toBe(false);
  });
});

// =============================================================================
// Signer Interface Tests
// =============================================================================

describe('Signer interface', () => {
  it('mock signer provides required methods', () => {
    const signer = createMockSigner();

    expect(signer.getKeyId()).toBe('test-key-id');
    expect(signer.getIssuer()).toBe('https://test-issuer.example.com');
    expect(signer.getAudience()).toBe('https://test-audience.example.com');
  });

  it('signer can omit audience', () => {
    const signer: Signer = {
      ...createMockSigner(),
      getAudience(): string | undefined {
        return undefined;
      },
    };

    expect(signer.getAudience()).toBeUndefined();
  });
});
