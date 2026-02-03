/**
 * @peac/adapter-openclaw - Hooks Tests
 *
 * Tests for OpenClaw hook bindings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createHookHandler,
  captureBatch,
  captureParallel,
  createSessionHistoryTailer,
} from '../src/hooks.js';
import type { OpenClawToolCallEvent } from '../src/types.js';
import type { CaptureSession, CaptureResult, SpoolEntry, CapturedAction } from '@peac/capture-core';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_TIMESTAMP = '2024-02-01T10:00:00Z';

/**
 * Build expected interaction ID in the new format.
 * Format: openclaw/{base64url(run_id)}/{base64url(tool_call_id)}
 */
function expectedInteractionId(runId: string, toolCallId: string): string {
  const encode = (s: string) => {
    const bytes = new TextEncoder().encode(s);
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `openclaw/${encode(runId)}/${encode(toolCallId)}`;
}

function createValidEvent(overrides?: Partial<OpenClawToolCallEvent>): OpenClawToolCallEvent {
  return {
    tool_call_id: 'call_123',
    run_id: 'run_abc',
    tool_name: 'web_search',
    started_at: VALID_TIMESTAMP,
    status: 'ok',
    input: { query: 'hello' },
    ...overrides,
  };
}

function createMockSession(): CaptureSession & { capturedActions: CapturedAction[] } {
  const capturedActions: CapturedAction[] = [];
  let sequence = 0;
  let headDigest = '0'.repeat(64);

  return {
    capturedActions,
    async capture(action: CapturedAction): Promise<CaptureResult> {
      capturedActions.push(action);
      sequence++;

      const entry: SpoolEntry = {
        captured_at: action.completed_at ?? action.started_at,
        action,
        sequence,
        prev_entry_digest: headDigest,
        entry_digest: 'entry_' + sequence,
      };

      headDigest = entry.entry_digest;

      return {
        success: true,
        entry,
      };
    },
    async commit(): Promise<void> {
      // No-op
    },
    async getHeadDigest(): Promise<string> {
      return headDigest;
    },
    async close(): Promise<void> {
      // No-op
    },
  };
}

function createFailingSession(
  errorCode: 'E_CAPTURE_STORE_FAILED' | 'E_CAPTURE_INTERNAL'
): CaptureSession {
  return {
    async capture(): Promise<CaptureResult> {
      return {
        success: false,
        code: errorCode,
        message: 'Simulated failure',
      };
    },
    async commit(): Promise<void> {
      // No-op
    },
    async getHeadDigest(): Promise<string> {
      return '0'.repeat(64);
    },
    async close(): Promise<void> {
      // No-op
    },
  };
}

// =============================================================================
// Hook Handler Tests
// =============================================================================

describe('createHookHandler', () => {
  let mockSession: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    mockSession = createMockSession();
  });

  describe('afterToolCall', () => {
    it('captures valid events', async () => {
      const handler = createHookHandler({ session: mockSession });
      const event = createValidEvent();

      const result = await handler.afterToolCall(event);

      expect(result.success).toBe(true);
      expect(mockSession.capturedActions).toHaveLength(1);
      expect(mockSession.capturedActions[0].id).toBe(expectedInteractionId('run_abc', 'call_123'));
    });

    it('returns entry on success', async () => {
      const handler = createHookHandler({ session: mockSession });
      const event = createValidEvent();

      const result = await handler.afterToolCall(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.entry.action.id).toBe(expectedInteractionId('run_abc', 'call_123'));
        expect(result.entry.sequence).toBe(1);
      }
    });

    it('returns error for invalid events', async () => {
      const handler = createHookHandler({ session: mockSession });
      const event = createValidEvent({ tool_call_id: '' }); // Invalid

      const result = await handler.afterToolCall(event);

      expect(result.success).toBe(false);
      expect(result.code).toContain('MISSING_FIELD');
    });

    it('invokes onCapture callback on success', async () => {
      const onCapture = vi.fn();
      const handler = createHookHandler({
        session: mockSession,
        onCapture,
      });
      const event = createValidEvent();

      await handler.afterToolCall(event);

      expect(onCapture).toHaveBeenCalledTimes(1);
      expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ success: true }), event);
    });

    it('invokes onCapture callback on capture failure', async () => {
      const failingSession = createFailingSession('E_CAPTURE_STORE_FAILED');
      const onCapture = vi.fn();
      const handler = createHookHandler({
        session: failingSession,
        onCapture,
      });
      const event = createValidEvent();

      await handler.afterToolCall(event);

      expect(onCapture).toHaveBeenCalledTimes(1);
      expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ success: false }), event);
    });

    it('invokes onMappingError callback on mapping failure', async () => {
      const onMappingError = vi.fn();
      const handler = createHookHandler({
        session: mockSession,
        onMappingError,
      });
      const event = createValidEvent({ tool_call_id: '' }); // Invalid

      await handler.afterToolCall(event);

      expect(onMappingError).toHaveBeenCalledTimes(1);
      expect(onMappingError).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
        event
      );
    });

    it('applies config to mapping', async () => {
      const handler = createHookHandler({
        session: mockSession,
        config: { platform: 'custom-platform' },
      });
      const event = createValidEvent();

      await handler.afterToolCall(event);

      expect(mockSession.capturedActions[0].platform).toBe('custom-platform');
    });
  });

  describe('getSession', () => {
    it('returns the underlying session', () => {
      const handler = createHookHandler({ session: mockSession });
      expect(handler.getSession()).toBe(mockSession);
    });
  });

  describe('close', () => {
    it('closes the underlying session', async () => {
      const closeSpy = vi.spyOn(mockSession, 'close');
      const handler = createHookHandler({ session: mockSession });

      await handler.close();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// Batch Capture Tests
// =============================================================================

describe('captureBatch', () => {
  it('captures events in sequence', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: 'call_2' }),
      createValidEvent({ tool_call_id: 'call_3' }),
    ];

    const results = await captureBatch(handler, events);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);

    // Verify sequence order
    expect(mockSession.capturedActions.map((a) => a.id)).toEqual([
      expectedInteractionId('run_abc', 'call_1'),
      expectedInteractionId('run_abc', 'call_2'),
      expectedInteractionId('run_abc', 'call_3'),
    ]);
  });

  it('continues after individual failures', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: '' }), // Invalid
      createValidEvent({ tool_call_id: 'call_3' }),
    ];

    const results = await captureBatch(handler, events);

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);

    // Valid events should still be captured
    expect(mockSession.capturedActions).toHaveLength(2);
  });

  it('handles empty batch', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    const results = await captureBatch(handler, []);

    expect(results).toHaveLength(0);
    expect(mockSession.capturedActions).toHaveLength(0);
  });
});

describe('captureParallel', () => {
  it('captures events in parallel', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: 'call_2' }),
      createValidEvent({ tool_call_id: 'call_3' }),
    ];

    const results = await captureParallel(handler, events);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);

    // All events should be captured (order may vary)
    expect(mockSession.capturedActions).toHaveLength(3);
  });

  it('returns results in event order', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: 'call_2' }),
    ];

    const results = await captureParallel(handler, events);

    // Results should match event order (Promise.all preserves order)
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });
});

// =============================================================================
// Session History Tailer Tests
// =============================================================================

describe('createSessionHistoryTailer', () => {
  it('starts and stops correctly', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });
    const fetchHistory = vi.fn().mockResolvedValue([]);

    const tailer = createSessionHistoryTailer({
      handler,
      sessionId: 'session_123',
      fetchHistory,
      pollIntervalMs: 100,
    });

    expect(tailer.isRunning()).toBe(false);

    tailer.start();
    expect(tailer.isRunning()).toBe(true);

    tailer.stop();
    expect(tailer.isRunning()).toBe(false);
  });

  it('fetches and captures events', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    let callCount = 0;
    const fetchHistory = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([createValidEvent({ tool_call_id: 'call_1' })]);
      }
      return Promise.resolve([]);
    });

    const tailer = createSessionHistoryTailer({
      handler,
      sessionId: 'session_123',
      fetchHistory,
      pollIntervalMs: 50,
    });

    tailer.start();

    // Wait for initial poll
    await new Promise((resolve) => setTimeout(resolve, 100));

    tailer.stop();

    expect(fetchHistory).toHaveBeenCalled();
    expect(mockSession.capturedActions).toHaveLength(1);
  });

  it('tracks last event ID', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });

    let callCount = 0;
    const fetchHistory = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve([
          createValidEvent({ tool_call_id: 'call_1' }),
          createValidEvent({ tool_call_id: 'call_2' }),
        ]);
      }
      return Promise.resolve([]);
    });

    const tailer = createSessionHistoryTailer({
      handler,
      sessionId: 'session_123',
      fetchHistory,
      pollIntervalMs: 50,
    });

    expect(tailer.getLastEventId()).toBeUndefined();

    tailer.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    tailer.stop();

    expect(tailer.getLastEventId()).toBe('call_2');
  });

  it('invokes onError callback on fetch failure', async () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });
    const onError = vi.fn();

    const fetchHistory = vi.fn().mockRejectedValue(new Error('Network error'));

    const tailer = createSessionHistoryTailer({
      handler,
      sessionId: 'session_123',
      fetchHistory,
      pollIntervalMs: 50,
      onError,
    });

    tailer.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    tailer.stop();

    expect(onError).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('is idempotent for start/stop', () => {
    const mockSession = createMockSession();
    const handler = createHookHandler({ session: mockSession });
    const fetchHistory = vi.fn().mockResolvedValue([]);

    const tailer = createSessionHistoryTailer({
      handler,
      sessionId: 'session_123',
      fetchHistory,
    });

    // Multiple starts should be idempotent
    tailer.start();
    tailer.start();
    tailer.start();
    expect(tailer.isRunning()).toBe(true);

    // Multiple stops should be idempotent
    tailer.stop();
    tailer.stop();
    tailer.stop();
    expect(tailer.isRunning()).toBe(false);
  });
});
