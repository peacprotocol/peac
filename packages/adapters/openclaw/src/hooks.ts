/**
 * @peac/adapter-openclaw - Hook Bindings
 *
 * Hook bindings for OpenClaw tool call capture.
 * Designed for sync capture (< 10ms target).
 */

import type { CaptureSession, CaptureResult, SpoolEntry } from '@peac/capture-core';
import type { OpenClawToolCallEvent, OpenClawAdapterConfig, MappingResult } from './types.js';
import { mapToolCallEvent } from './mapper.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a hook capture operation.
 * More flexible than CaptureResult to allow adapter-specific error codes.
 */
export type HookCaptureResult =
  | { success: true; entry: SpoolEntry }
  | { success: false; code: string; message: string };

// =============================================================================
// Hook Handler Interface
// =============================================================================

/**
 * Hook handler for OpenClaw tool call events.
 */
export interface OpenClawHookHandler {
  /** Handle after_tool_call hook */
  afterToolCall(event: OpenClawToolCallEvent): Promise<HookCaptureResult>;

  /** Get the underlying capture session */
  getSession(): CaptureSession;

  /** Close the handler */
  close(): Promise<void>;
}

/**
 * Configuration for creating a hook handler.
 */
export interface HookHandlerConfig {
  /** Capture session to use */
  session: CaptureSession;

  /** Adapter configuration */
  config?: OpenClawAdapterConfig;

  /** Callback for capture events (for telemetry/logging) */
  onCapture?: (result: HookCaptureResult, event: OpenClawToolCallEvent) => void;

  /** Callback for mapping errors */
  onMappingError?: (result: MappingResult, event: OpenClawToolCallEvent) => void;
}

// =============================================================================
// Hook Handler Implementation
// =============================================================================

/**
 * Create a hook handler for OpenClaw tool call events.
 *
 * @param handlerConfig - Configuration for the handler
 * @returns Hook handler instance
 */
export function createHookHandler(handlerConfig: HookHandlerConfig): OpenClawHookHandler {
  const { session, config, onCapture, onMappingError } = handlerConfig;

  return {
    async afterToolCall(event: OpenClawToolCallEvent): Promise<HookCaptureResult> {
      // Map OpenClaw event to CapturedAction
      const mappingResult = mapToolCallEvent(event, config);

      if (!mappingResult.success || !mappingResult.action) {
        // Mapping failed - report and return error result
        if (onMappingError) {
          onMappingError(mappingResult, event);
        }

        return {
          success: false,
          code: mappingResult.error_code ?? 'E_OPENCLAW_MAPPING_FAILED',
          message: mappingResult.error_message ?? 'Failed to map OpenClaw event',
        };
      }

      // Capture the action
      const captureResult = await session.capture(mappingResult.action);

      // Convert to HookCaptureResult (compatible types)
      const hookResult: HookCaptureResult = captureResult.success
        ? { success: true, entry: captureResult.entry }
        : { success: false, code: captureResult.code, message: captureResult.message };

      // Invoke callback
      if (onCapture) {
        onCapture(hookResult, event);
      }

      return hookResult;
    },

    getSession(): CaptureSession {
      return session;
    },

    async close(): Promise<void> {
      await session.close();
    },
  };
}

// =============================================================================
// Batch Capture
// =============================================================================

/**
 * Capture multiple tool call events in sequence.
 *
 * Note: Events are captured in order. For parallel capture, use individual
 * afterToolCall calls with Promise.all.
 *
 * @param handler - Hook handler
 * @param events - Array of tool call events
 * @returns Array of capture results (same order as events)
 */
export async function captureBatch(
  handler: OpenClawHookHandler,
  events: OpenClawToolCallEvent[]
): Promise<HookCaptureResult[]> {
  const results: HookCaptureResult[] = [];

  for (const event of events) {
    const result = await handler.afterToolCall(event);
    results.push(result);
  }

  return results;
}

/**
 * Capture multiple tool call events in parallel.
 *
 * Warning: Parallel capture may result in non-deterministic chain ordering.
 * Use captureBatch for deterministic ordering.
 *
 * @param handler - Hook handler
 * @param events - Array of tool call events
 * @returns Array of capture results (same order as events)
 */
export async function captureParallel(
  handler: OpenClawHookHandler,
  events: OpenClawToolCallEvent[]
): Promise<HookCaptureResult[]> {
  return Promise.all(events.map((event) => handler.afterToolCall(event)));
}

// =============================================================================
// Session History Tailer (Fallback)
// =============================================================================

/**
 * Session history tailer for fallback capture.
 *
 * If OpenClaw hooks don't provide complete event data, this can poll
 * the session history API to backfill missed events.
 */
export interface SessionHistoryTailer {
  /** Start tailing session history */
  start(): void;

  /** Stop tailing */
  stop(): void;

  /** Get the last processed event ID */
  getLastEventId(): string | undefined;

  /** Whether the tailer is running */
  isRunning(): boolean;
}

/**
 * Configuration for session history tailer.
 */
export interface TailerConfig {
  /** Hook handler to use for capture */
  handler: OpenClawHookHandler;

  /** Session ID to tail */
  sessionId: string;

  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;

  /** Function to fetch session history */
  fetchHistory: (sessionId: string, afterEventId?: string) => Promise<OpenClawToolCallEvent[]>;

  /** Callback for tailer errors */
  onError?: (error: Error) => void;
}

/**
 * Create a session history tailer.
 *
 * @param tailerConfig - Configuration for the tailer
 * @returns Session history tailer instance
 */
export function createSessionHistoryTailer(tailerConfig: TailerConfig): SessionHistoryTailer {
  const { handler, sessionId, pollIntervalMs = 1000, fetchHistory, onError } = tailerConfig;

  let running = false;
  let lastEventId: string | undefined;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;

  const poll = async () => {
    try {
      const events = await fetchHistory(sessionId, lastEventId);

      for (const event of events) {
        await handler.afterToolCall(event);
        lastEventId = event.tool_call_id;
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      intervalHandle = setInterval(poll, pollIntervalMs);
      // Run immediately on start
      poll();
    },

    stop(): void {
      if (!running) return;
      running = false;
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = undefined;
      }
    },

    getLastEventId(): string | undefined {
      return lastEventId;
    },

    isRunning(): boolean {
      return running;
    },
  };
}
