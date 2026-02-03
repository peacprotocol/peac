/**
 * @peac/adapter-openclaw - Mapper Tests
 *
 * Tests for OpenClaw event to CapturedAction mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  mapToolCallEvent,
  mapToolCallEventBatch,
  extractWorkflowId,
  buildWorkflowContext,
} from '../src/mapper.js';
import type { OpenClawToolCallEvent } from '../src/types.js';
import { OPENCLAW_ERROR_CODES, OPENCLAW_EXTENSION_KEYS } from '../src/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_TIMESTAMP = '2024-02-01T10:00:00Z';
const VALID_TIMESTAMP_LATER = '2024-02-01T10:00:01Z';

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
    input: { query: 'hello world' },
    output: { results: ['result1', 'result2'] },
    completed_at: VALID_TIMESTAMP_LATER,
    ...overrides,
  };
}

// =============================================================================
// Basic Mapping Tests
// =============================================================================

describe('mapToolCallEvent', () => {
  describe('valid events', () => {
    it('maps a minimal valid event', () => {
      const event = createValidEvent();
      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action).toBeDefined();
      expect(result.action!.id).toBe(expectedInteractionId('run_abc', 'call_123'));
      expect(result.action!.kind).toBe('tool.call');
      expect(result.action!.platform).toBe('openclaw');
      expect(result.action!.tool_name).toBe('web_search');
      expect(result.action!.started_at).toBe(VALID_TIMESTAMP);
      expect(result.action!.completed_at).toBe(VALID_TIMESTAMP_LATER);
      expect(result.action!.status).toBe('ok');
    });

    it('maps event with all fields', () => {
      const event = createValidEvent({
        tool_provider: 'builtin',
        tool_version: '1.0.0',
        session_key: 'session_xyz',
        duration_ms: 1000,
        policy: {
          decision: 'allow',
          sandbox_enabled: true,
          elevated: false,
          policy_hash: 'sha256:abc123',
        },
        context: {
          channel: { kind: 'direct', id: 'chan_1' },
          workspace_digest: 'sha256:workspace',
          gateway_version: '0.2.0',
          audit_digest: 'sha256:audit',
        },
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.tool_provider).toBe('builtin');
      // tool_version is stored in metadata, not on action directly
      expect(result.action!.metadata).toMatchObject({
        tool_version: '1.0.0',
        policy_decision: 'allow',
        sandbox_enabled: true,
        elevated: false,
        policy_hash: 'sha256:abc123',
      });
    });

    it('serializes input/output to bytes', () => {
      const event = createValidEvent({
        input: { query: 'test' },
        output: { result: 'found' },
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.input_bytes).toBeInstanceOf(Uint8Array);
      expect(result.action!.output_bytes).toBeInstanceOf(Uint8Array);

      // Verify content
      const inputStr = new TextDecoder().decode(result.action!.input_bytes);
      expect(JSON.parse(inputStr)).toEqual({ query: 'test' });
    });

    it('handles undefined output', () => {
      const event = createValidEvent({ output: undefined });
      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.output_bytes).toBeUndefined();
    });

    it('handles error status', () => {
      const event = createValidEvent({
        status: 'error',
        error_code: 'TOOL_FAILED',
        retryable: true,
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.status).toBe('error');
      expect(result.action!.error_code).toBe('TOOL_FAILED');
      expect(result.action!.retryable).toBe(true);
    });

    it('handles timeout status', () => {
      const event = createValidEvent({ status: 'timeout' });
      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.status).toBe('timeout');
    });

    it('handles canceled status', () => {
      const event = createValidEvent({ status: 'canceled' });
      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.status).toBe('canceled');
    });
  });

  describe('custom configuration', () => {
    it('uses custom platform name', () => {
      const event = createValidEvent();
      const result = mapToolCallEvent(event, { platform: 'custom-platform' });

      expect(result.success).toBe(true);
      expect(result.action!.platform).toBe('custom-platform');
    });

    it('includes platform version in metadata', () => {
      const event = createValidEvent();
      const result = mapToolCallEvent(event, {
        platform_version: '2.0.0',
      });

      expect(result.success).toBe(true);
      expect(result.action!.metadata?.platform_version).toBe('2.0.0');
    });

    it('includes plugin ID in metadata', () => {
      const event = createValidEvent();
      const result = mapToolCallEvent(event, {
        plugin_id: 'peac-receipts',
      });

      expect(result.success).toBe(true);
      expect(result.action!.metadata?.plugin_id).toBe('peac-receipts');
    });
  });

  describe('interaction ID generation', () => {
    it('generates deterministic interaction ID', () => {
      const event = createValidEvent({
        run_id: 'run_abc',
        tool_call_id: 'call_123',
      });

      const result1 = mapToolCallEvent(event);
      const result2 = mapToolCallEvent(event);

      expect(result1.action!.id).toBe(result2.action!.id);
      expect(result1.action!.id).toBe(expectedInteractionId('run_abc', 'call_123'));
    });

    it('different events have different IDs', () => {
      const event1 = createValidEvent({ tool_call_id: 'call_1' });
      const event2 = createValidEvent({ tool_call_id: 'call_2' });

      const result1 = mapToolCallEvent(event1);
      const result2 = mapToolCallEvent(event2);

      expect(result1.action!.id).not.toBe(result2.action!.id);
    });
  });

  describe('OpenClaw extensions', () => {
    it('includes tool_call_id in context extension', () => {
      const event = createValidEvent();
      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      const contextExt = result.action!.metadata?.[OPENCLAW_EXTENSION_KEYS.CONTEXT] as Record<
        string,
        unknown
      >;
      expect(contextExt.tool_call_id).toBe('call_123');
    });

    it('includes channel info in context extension', () => {
      const event = createValidEvent({
        context: {
          channel: { kind: 'group', id: 'grp_1' },
        },
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      const contextExt = result.action!.metadata?.[OPENCLAW_EXTENSION_KEYS.CONTEXT] as Record<
        string,
        unknown
      >;
      expect(contextExt.channel).toEqual({ kind: 'group', id: 'grp_1' });
    });

    it('includes audit digest as separate extension', () => {
      const event = createValidEvent({
        context: {
          audit_digest: 'sha256:audit123',
        },
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(true);
      expect(result.action!.metadata?.[OPENCLAW_EXTENSION_KEYS.AUDIT_DIGEST]).toBe(
        'sha256:audit123'
      );
    });
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('validation', () => {
  describe('required fields', () => {
    it('rejects missing tool_call_id', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).tool_call_id = '';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.MISSING_FIELD);
      expect(result.error_message).toContain('tool_call_id');
    });

    it('rejects missing run_id', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).run_id = '';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.MISSING_FIELD);
      expect(result.error_message).toContain('run_id');
    });

    it('rejects missing tool_name', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).tool_name = '';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.MISSING_FIELD);
      expect(result.error_message).toContain('tool_name');
    });

    it('rejects missing started_at', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).started_at = '';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.MISSING_FIELD);
      expect(result.error_message).toContain('started_at');
    });

    it('rejects missing status', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).status = '';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.MISSING_FIELD);
      expect(result.error_message).toContain('status');
    });
  });

  describe('field validation', () => {
    it('rejects invalid status', () => {
      const event = createValidEvent();
      (event as Record<string, unknown>).status = 'invalid_status';

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.INVALID_FIELD);
      expect(result.error_message).toContain('Invalid status');
    });

    it('rejects invalid started_at timestamp', () => {
      const event = createValidEvent({
        started_at: 'not-a-timestamp',
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.INVALID_FIELD);
      expect(result.error_message).toContain('Invalid started_at timestamp');
    });

    it('rejects invalid completed_at timestamp', () => {
      const event = createValidEvent({
        completed_at: 'not-a-timestamp',
      });

      const result = mapToolCallEvent(event);

      expect(result.success).toBe(false);
      expect(result.error_code).toBe(OPENCLAW_ERROR_CODES.INVALID_FIELD);
      expect(result.error_message).toContain('Invalid completed_at timestamp');
    });

    it('accepts valid RFC 3339 timestamps', () => {
      const timestamps = [
        '2024-02-01T10:00:00Z',
        '2024-02-01T10:00:00.123Z',
        '2024-02-01T10:00:00+00:00',
        '2024-02-01T10:00:00-05:00',
      ];

      for (const ts of timestamps) {
        const event = createValidEvent({ started_at: ts });
        const result = mapToolCallEvent(event);
        expect(result.success, `Timestamp ${ts} should be valid`).toBe(true);
      }
    });
  });
});

// =============================================================================
// Batch Mapping Tests
// =============================================================================

describe('mapToolCallEventBatch', () => {
  it('maps multiple events', () => {
    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: 'call_2' }),
      createValidEvent({ tool_call_id: 'call_3' }),
    ];

    const results = mapToolCallEventBatch(events);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results[0].action!.id).toBe(expectedInteractionId('run_abc', 'call_1'));
    expect(results[1].action!.id).toBe(expectedInteractionId('run_abc', 'call_2'));
    expect(results[2].action!.id).toBe(expectedInteractionId('run_abc', 'call_3'));
  });

  it('handles mixed valid/invalid events', () => {
    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: '' }), // Invalid
      createValidEvent({ tool_call_id: 'call_3' }),
    ];

    const results = mapToolCallEventBatch(events);

    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });

  it('applies config to all events', () => {
    const events = [
      createValidEvent({ tool_call_id: 'call_1' }),
      createValidEvent({ tool_call_id: 'call_2' }),
    ];

    const results = mapToolCallEventBatch(events, { platform: 'custom' });

    expect(results.every((r) => r.action?.platform === 'custom')).toBe(true);
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('utility functions', () => {
  describe('extractWorkflowId', () => {
    it('returns session_key as workflow ID', () => {
      const event = createValidEvent({ session_key: 'session_123' });
      expect(extractWorkflowId(event)).toBe('session_123');
    });

    it('returns undefined if no session_key', () => {
      const event = createValidEvent({ session_key: undefined });
      expect(extractWorkflowId(event)).toBeUndefined();
    });
  });

  describe('buildWorkflowContext', () => {
    it('builds workflow context from event', () => {
      const event = createValidEvent({
        session_key: 'session_123',
        tool_call_id: 'call_456',
        tool_name: 'web_search',
      });

      const context = buildWorkflowContext(event);

      expect(context).toEqual({
        workflow_id: 'session_123',
        step_id: 'call_456',
        tool_name: 'web_search',
        framework: 'openclaw',
      });
    });

    it('returns undefined if no session_key', () => {
      const event = createValidEvent({ session_key: undefined });
      expect(buildWorkflowContext(event)).toBeUndefined();
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('handles empty input object', () => {
    const event = createValidEvent({ input: {} });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    expect(result.action!.input_bytes).toBeDefined();
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toEqual({});
  });

  it('handles null input', () => {
    const event = createValidEvent({ input: null });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    expect(result.action!.input_bytes).toBeDefined();
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toBeNull();
  });

  it('handles large payload', () => {
    const largeInput = { data: 'x'.repeat(100000) };
    const event = createValidEvent({ input: largeInput });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    expect(result.action!.input_bytes!.length).toBeGreaterThan(100000);
  });

  it('handles special characters in strings', () => {
    const event = createValidEvent({
      input: { query: 'hello "world" \n\t' },
    });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toEqual({ query: 'hello "world" \n\t' });
  });

  it('handles unicode in strings', () => {
    const event = createValidEvent({
      input: { query: 'hello world' },
    });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toEqual({ query: 'hello world' });
  });

  it('handles deeply nested objects', () => {
    const event = createValidEvent({
      input: { a: { b: { c: { d: { e: 'deep' } } } } },
    });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toEqual({ a: { b: { c: { d: { e: 'deep' } } } } });
  });

  it('handles arrays in input', () => {
    const event = createValidEvent({
      input: [1, 2, 3, { nested: true }],
    });
    const result = mapToolCallEvent(event);

    expect(result.success).toBe(true);
    const inputStr = new TextDecoder().decode(result.action!.input_bytes);
    expect(JSON.parse(inputStr)).toEqual([1, 2, 3, { nested: true }]);
  });
});
