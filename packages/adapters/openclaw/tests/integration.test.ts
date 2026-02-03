/**
 * @peac/adapter-openclaw - Integration Tests
 *
 * End-to-end tests that exercise the full capture pipeline:
 * OpenClaw event -> Hook Handler -> Capture Session -> Spool -> Emitter -> Receipt
 */

import { describe, it, expect } from 'vitest';
import { createCaptureSession, createHasher } from '@peac/capture-core';
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '@peac/capture-core/testkit';
import { createHookHandler, createReceiptEmitter, createBackgroundService } from '../src/index.js';
import type { OpenClawToolCallEvent } from '../src/types.js';
import type { Signer, ReceiptWriter, SignedReceipt } from '../src/emitter.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_TIMESTAMP = '2024-02-01T10:00:00Z';
const VALID_TIMESTAMP_LATER = '2024-02-01T10:00:01Z';

function createValidEvent(overrides?: Partial<OpenClawToolCallEvent>): OpenClawToolCallEvent {
  return {
    tool_call_id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    run_id: 'run_integration_test',
    tool_name: 'web_search',
    started_at: VALID_TIMESTAMP,
    status: 'ok',
    input: { query: 'integration test query' },
    output: { results: ['result1', 'result2'] },
    completed_at: VALID_TIMESTAMP_LATER,
    ...overrides,
  };
}

function createMockSigner(): Signer {
  return {
    async sign(payload: unknown): Promise<string> {
      // Simple mock that returns a deterministic JWS-like string
      const payloadStr = JSON.stringify(payload);
      return `eyJhbGciOiJFZERTQSJ9.${btoa(payloadStr).replace(/=/g, '')}.mock_signature`;
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
// Integration Tests
// =============================================================================

describe('OpenClaw Adapter Integration', () => {
  describe('full pipeline: event -> capture -> emit', () => {
    it('captures events and emits receipts end-to-end', async () => {
      // 1. Create a real capture session with in-memory storage
      const store = createInMemorySpoolStore();
      const dedupe = createInMemoryDedupeIndex();
      const hasher = createHasher();

      const session = createCaptureSession({
        store,
        dedupe,
        hasher,
      });

      // 2. Create hook handler
      const handler = createHookHandler({ session });

      // 3. Create emitter with mock signer/writer
      const mockWriter = createMockWriter();
      const emitter = createReceiptEmitter({
        signer: createMockSigner(),
        writer: mockWriter,
      });

      // 4. Create background service that drains the session
      const emittedDigests: string[] = [];
      const service = createBackgroundService({
        emitter,
        getPendingEntries: async () => {
          // Get entries that haven't been emitted yet
          const entries = store.getAllEntries();
          return entries.filter((e) => !emittedDigests.includes(e.entry_digest));
        },
        markEmitted: async (digest) => {
          emittedDigests.push(digest);
        },
      });

      // 5. Capture multiple events through the hook handler
      const event1 = createValidEvent({ tool_call_id: 'call_1', tool_name: 'web_search' });
      const event2 = createValidEvent({ tool_call_id: 'call_2', tool_name: 'file_read' });
      const event3 = createValidEvent({ tool_call_id: 'call_3', tool_name: 'code_execute' });

      const result1 = await handler.afterToolCall(event1);
      const result2 = await handler.afterToolCall(event2);
      const result3 = await handler.afterToolCall(event3);

      // Verify all captures succeeded
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);

      // Verify spool has 3 entries
      expect(store.getAllEntries()).toHaveLength(3);

      // 6. Drain the emitter
      await service.drain();

      // 7. Verify receipts were written
      expect(mockWriter.receipts).toHaveLength(3);
      expect(emittedDigests).toHaveLength(3);

      // Verify receipt structure
      const receipt = mockWriter.receipts[0];
      expect(receipt.rid).toMatch(/^r_/);
      expect(receipt.jws).toMatch(/^eyJhbGciOiJFZERTQSJ9\./);
      expect(receipt.interaction_id).toContain('openclaw/');
      expect(receipt.entry_digest).toBeDefined();

      // 8. Verify chain integrity
      const entries = store.getAllEntries();
      expect(entries[0].prev_entry_digest).toBe('0'.repeat(64)); // Genesis
      expect(entries[1].prev_entry_digest).toBe(entries[0].entry_digest);
      expect(entries[2].prev_entry_digest).toBe(entries[1].entry_digest);

      // 9. Cleanup
      await session.close();
      await emitter.close();
    });

    it('handles deduplication correctly', async () => {
      const store = createInMemorySpoolStore();
      const dedupe = createInMemoryDedupeIndex();
      const hasher = createHasher();

      const session = createCaptureSession({
        store,
        dedupe,
        hasher,
      });

      const handler = createHookHandler({ session });

      // Capture the same event twice (same tool_call_id and run_id)
      const event = createValidEvent({ tool_call_id: 'duplicate_call', run_id: 'run_123' });

      const result1 = await handler.afterToolCall(event);
      const result2 = await handler.afterToolCall(event);

      // First should succeed
      expect(result1.success).toBe(true);

      // Second should be deduplicated (returns duplicate error)
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.code).toBe('E_CAPTURE_DUPLICATE');
      }

      // Only one entry in spool
      expect(store.getAllEntries()).toHaveLength(1);

      await session.close();
    });

    it('preserves event data through the pipeline', async () => {
      const store = createInMemorySpoolStore();
      const dedupe = createInMemoryDedupeIndex();
      const hasher = createHasher();

      const session = createCaptureSession({
        store,
        dedupe,
        hasher,
      });

      const handler = createHookHandler({ session });

      const event = createValidEvent({
        tool_call_id: 'call_data_test',
        run_id: 'run_data_test',
        tool_name: 'complex_tool',
        tool_provider: 'mcp',
        input: { nested: { data: [1, 2, 3] } },
        output: { response: { success: true } },
        policy: {
          decision: 'allow',
          sandbox_enabled: true,
          elevated: false,
        },
      });

      const result = await handler.afterToolCall(event);
      expect(result.success).toBe(true);

      // Verify the captured action has the expected data
      const entries = store.getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      const action = entry.action;
      expect(action.tool_name).toBe('complex_tool');
      expect(action.tool_provider).toBe('mcp');
      expect(action.status).toBe('ok');

      // Bytes are hashed and stripped from action for privacy/efficiency
      // The spool entry contains the digests
      expect(entry.input_digest).toBeDefined();
      expect(entry.output_digest).toBeDefined();

      // Verify digests have expected format
      expect(entry.input_digest!.alg).toBe('sha-256');
      expect(entry.input_digest!.value).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.output_digest!.alg).toBe('sha-256');
      expect(entry.output_digest!.value).toMatch(/^[a-f0-9]{64}$/);

      await session.close();
    });

    it('handles errors gracefully', async () => {
      const store = createInMemorySpoolStore();
      const dedupe = createInMemoryDedupeIndex();
      const hasher = createHasher();

      const session = createCaptureSession({
        store,
        dedupe,
        hasher,
      });

      const handler = createHookHandler({ session });

      // Event with missing required fields should fail mapping
      const invalidEvent = {
        tool_call_id: 'call_123',
        // Missing run_id, tool_name, started_at, status
      } as OpenClawToolCallEvent;

      const result = await handler.afterToolCall(invalidEvent);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('E_OPENCLAW_MISSING_FIELD');
      }

      // No entry should be captured
      expect(store.getAllEntries()).toHaveLength(0);

      await session.close();
    });
  });

  describe('payload size limits', () => {
    it('handles large payloads with truncation', async () => {
      const store = createInMemorySpoolStore();
      const dedupe = createInMemoryDedupeIndex();
      const hasher = createHasher();

      const session = createCaptureSession({
        store,
        dedupe,
        hasher,
      });

      // Create handler with small max payload size for testing
      const handler = createHookHandler({
        session,
        config: {
          capture: {
            mode: 'hash_only',
            max_payload_size: 100, // Very small for testing
          },
        },
      });

      // Create event with large payload
      const largeInput = { data: 'x'.repeat(200) }; // > 100 bytes
      const event = createValidEvent({
        tool_call_id: 'call_large_payload',
        input: largeInput,
      });

      const result = await handler.afterToolCall(event);

      expect(result.success).toBe(true);

      // Entry should exist
      const entries = store.getAllEntries();
      expect(entries).toHaveLength(1);

      // The input was truncated by the mapper before capture
      // Verify the digest exists and was computed from truncated input
      expect(entries[0].input_digest).toBeDefined();
      expect(entries[0].input_digest!.alg).toBe('sha-256');

      // The bytes field in the digest tracks the truncated size
      // since that's what was actually hashed
      expect(entries[0].input_digest!.bytes).toBeLessThanOrEqual(100);

      await session.close();
    });
  });
});
