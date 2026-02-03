/**
 * @peac/capture-core - Queue Safety Tests
 *
 * These tests prove that the capture queue is resilient to failures:
 * 1. capture() NEVER throws - all failures return CaptureResult
 * 2. Queue never remains wedged - subsequent captures succeed after failure
 */

import { describe, it, expect } from 'vitest';
import { createCaptureSession, createHasher } from '../src';
import {
  createInMemorySpoolStore,
  createInMemoryDedupeIndex,
} from '../src/testkit';
import type {
  CapturedAction,
  SpoolStore,
  DedupeIndex,
  DedupeEntry,
  SpoolEntry,
} from '../src';

// =============================================================================
// Test Fixtures
// =============================================================================

const FIXED_TIMESTAMP = '2024-02-01T10:00:00.000Z';

function createTestAction(id: string): CapturedAction {
  return {
    id,
    kind: 'tool.call',
    platform: 'test-platform',
    started_at: FIXED_TIMESTAMP,
  };
}

// =============================================================================
// Failing Store/Index Implementations
// =============================================================================

/**
 * DedupeIndex that throws on first has() call, then works normally.
 */
class ThrowOnceDedupeIndex implements DedupeIndex {
  private inner = createInMemoryDedupeIndex();
  private hasCallCount = 0;
  private throwOnCall: number;

  constructor(throwOnCall = 1) {
    this.throwOnCall = throwOnCall;
  }

  async has(actionId: string): Promise<boolean> {
    this.hasCallCount++;
    if (this.hasCallCount === this.throwOnCall) {
      throw new Error('DedupeIndex.has() simulated failure');
    }
    return this.inner.has(actionId);
  }

  async get(actionId: string): Promise<DedupeEntry | undefined> {
    return this.inner.get(actionId);
  }

  async set(actionId: string, entry: DedupeEntry): Promise<void> {
    return this.inner.set(actionId, entry);
  }

  async markEmitted(actionId: string): Promise<boolean> {
    return this.inner.markEmitted(actionId);
  }

  async delete(actionId: string): Promise<boolean> {
    return this.inner.delete(actionId);
  }

  async size(): Promise<number> {
    return this.inner.size();
  }

  async clear(): Promise<void> {
    return this.inner.clear();
  }
}

/**
 * SpoolStore that throws on first append() call, then works normally.
 */
class ThrowOnceSpoolStore implements SpoolStore {
  private inner = createInMemorySpoolStore();
  private appendCallCount = 0;
  private throwOnCall: number;

  constructor(throwOnCall = 1) {
    this.throwOnCall = throwOnCall;
  }

  async append(entry: SpoolEntry): Promise<void> {
    this.appendCallCount++;
    if (this.appendCallCount === this.throwOnCall) {
      throw new Error('SpoolStore.append() simulated failure');
    }
    return this.inner.append(entry);
  }

  async getHeadDigest(): Promise<string> {
    return this.inner.getHeadDigest();
  }

  async getSequence(): Promise<number> {
    return this.inner.getSequence();
  }

  async commit(): Promise<void> {
    return this.inner.commit();
  }

  async close(): Promise<void> {
    return this.inner.close();
  }
}

// =============================================================================
// Queue Safety Tests
// =============================================================================

describe('Queue Safety', () => {
  describe('capture() never throws', () => {
    it('returns CaptureResult when DedupeIndex.has() throws', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: new ThrowOnceDedupeIndex(1), // Throw on first call
        hasher: createHasher(),
      });

      // First capture should fail gracefully (not throw)
      const result1 = await session.capture(createTestAction('action-1'));

      expect(result1.success).toBe(false);
      if (!result1.success) {
        // User-supplied backends (DedupeIndex, SpoolStore) -> E_CAPTURE_STORE_FAILED
        // E_CAPTURE_INTERNAL is reserved for true invariants/bugs in capture-core
        expect(result1.code).toBe('E_CAPTURE_STORE_FAILED');
      }

      await session.close();
    });

    it('returns CaptureResult when SpoolStore.append() throws', async () => {
      const session = createCaptureSession({
        store: new ThrowOnceSpoolStore(1), // Throw on first call
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // First capture should fail gracefully (not throw)
      const result1 = await session.capture(createTestAction('action-1'));

      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.code).toBe('E_CAPTURE_STORE_FAILED');
      }

      await session.close();
    });

    it('returns CaptureResult when session is closed', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      await session.close();

      // Capture on closed session should return result, not throw
      const result = await session.capture(createTestAction('action-1'));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('E_CAPTURE_SESSION_CLOSED');
      }
    });
  });

  describe('queue not wedged after failure', () => {
    it('subsequent capture succeeds after DedupeIndex.has() failure', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: new ThrowOnceDedupeIndex(1), // Throw on first call only
        hasher: createHasher(),
      });

      // First capture fails
      const result1 = await session.capture(createTestAction('action-1'));
      expect(result1.success).toBe(false);

      // Second capture should succeed (queue not wedged)
      const result2 = await session.capture(createTestAction('action-2'));
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.entry.action.id).toBe('action-2');
        expect(result2.entry.sequence).toBe(1);
      }

      await session.close();
    });

    it('subsequent capture succeeds after SpoolStore.append() failure', async () => {
      const session = createCaptureSession({
        store: new ThrowOnceSpoolStore(1), // Throw on first call only
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // First capture fails
      const result1 = await session.capture(createTestAction('action-1'));
      expect(result1.success).toBe(false);

      // Second capture should succeed (queue not wedged)
      const result2 = await session.capture(createTestAction('action-2'));
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.entry.action.id).toBe('action-2');
      }

      await session.close();
    });

    it('chain integrity maintained after failure recovery', async () => {
      const session = createCaptureSession({
        store: new ThrowOnceSpoolStore(2), // Throw on second call
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // First capture succeeds
      const result1 = await session.capture(createTestAction('action-1'));
      expect(result1.success).toBe(true);

      // Second capture fails
      const result2 = await session.capture(createTestAction('action-2'));
      expect(result2.success).toBe(false);

      // Third capture succeeds and chain is valid
      const result3 = await session.capture(createTestAction('action-3'));
      expect(result3.success).toBe(true);
      if (result3.success && result1.success) {
        // Chain should link back to first successful entry
        expect(result3.entry.prev_entry_digest).toBe(result1.entry.entry_digest);
        expect(result3.entry.sequence).toBe(2); // Sequence continues from last success
      }

      await session.close();
    });
  });

  describe('concurrent capture safety', () => {
    it('parallel captures are serialized correctly', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // Launch multiple captures in parallel
      const promises = [
        session.capture(createTestAction('action-1')),
        session.capture(createTestAction('action-2')),
        session.capture(createTestAction('action-3')),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Sequences should be unique and contiguous
      const sequences = results
        .filter((r): r is { success: true; entry: SpoolEntry } => r.success)
        .map((r) => r.entry.sequence)
        .sort((a, b) => a - b);

      expect(sequences).toEqual([1, 2, 3]);

      await session.close();
    });

    it('parallel captures with one failure do not affect others', async () => {
      // Create a dedupe that throws on second has() call
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: new ThrowOnceDedupeIndex(2),
        hasher: createHasher(),
      });

      // Launch multiple captures in parallel
      const promises = [
        session.capture(createTestAction('action-1')),
        session.capture(createTestAction('action-2')),
        session.capture(createTestAction('action-3')),
      ];

      const results = await Promise.all(promises);

      // One should fail, others should succeed
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(2);
      expect(failures.length).toBe(1);

      await session.close();
    });
  });

  describe('error code classification', () => {
    /**
     * This test explicitly proves that E_CAPTURE_INTERNAL is reserved for true
     * internal bugs, NOT for user-supplied backend failures.
     *
     * Backend failures (DedupeIndex, SpoolStore) MUST return E_CAPTURE_STORE_FAILED.
     * E_CAPTURE_INTERNAL should only occur if there's a bug in capture-core itself.
     */
    it('E_CAPTURE_INTERNAL is never emitted for backend failures', async () => {
      // Test all backend failure points
      const backendFailureCases = [
        {
          name: 'DedupeIndex.has() throws',
          session: () =>
            createCaptureSession({
              store: createInMemorySpoolStore(),
              dedupe: new ThrowOnceDedupeIndex(1),
              hasher: createHasher(),
            }),
        },
        {
          name: 'SpoolStore.append() throws',
          session: () =>
            createCaptureSession({
              store: new ThrowOnceSpoolStore(1),
              dedupe: createInMemoryDedupeIndex(),
              hasher: createHasher(),
            }),
        },
        {
          name: 'SpoolStore.getHeadDigest() throws',
          session: () => {
            const store = createInMemorySpoolStore();
            store.getHeadDigest = async () => {
              throw new Error('getHeadDigest simulated failure');
            };
            return createCaptureSession({
              store,
              dedupe: createInMemoryDedupeIndex(),
              hasher: createHasher(),
            });
          },
        },
        {
          name: 'SpoolStore.getSequence() throws',
          session: () => {
            const store = createInMemorySpoolStore();
            store.getSequence = async () => {
              throw new Error('getSequence simulated failure');
            };
            return createCaptureSession({
              store,
              dedupe: createInMemoryDedupeIndex(),
              hasher: createHasher(),
            });
          },
        },
        {
          name: 'DedupeIndex.set() throws',
          session: () => {
            const dedupe = createInMemoryDedupeIndex();
            dedupe.set = async () => {
              throw new Error('DedupeIndex.set() simulated failure');
            };
            return createCaptureSession({
              store: createInMemorySpoolStore(),
              dedupe,
              hasher: createHasher(),
            });
          },
        },
      ];

      for (const { name, session: createSession } of backendFailureCases) {
        const session = createSession();
        const result = await session.capture(createTestAction(`action-${name}`));

        // Must fail
        expect(result.success).toBe(false);

        if (!result.success) {
          // MUST be E_CAPTURE_STORE_FAILED, NEVER E_CAPTURE_INTERNAL
          expect(result.code).not.toBe('E_CAPTURE_INTERNAL');
          expect(result.code).toBe('E_CAPTURE_STORE_FAILED');
        }

        await session.close();
      }
    });
  });

  describe('session lifecycle', () => {
    it('close() during in-flight capture does not deadlock', async () => {
      // Create a slow store to simulate in-flight capture
      const slowStore = createInMemorySpoolStore();
      const originalAppend = slowStore.append.bind(slowStore);
      slowStore.append = async (entry: SpoolEntry) => {
        // Simulate slow append (100ms)
        await new Promise((resolve) => setTimeout(resolve, 100));
        return originalAppend(entry);
      };

      const session = createCaptureSession({
        store: slowStore,
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // Start a capture (will be in-flight for 100ms)
      const capturePromise = session.capture(createTestAction('action-1'));

      // Close immediately while capture is in-flight
      // This should not deadlock
      const closePromise = session.close();

      // Both should complete (not hang)
      const [captureResult] = await Promise.all([capturePromise, closePromise]);

      // The capture may succeed or fail (depending on timing), but it should complete
      expect(typeof captureResult.success).toBe('boolean');
    });

    it('subsequent capture returns E_CAPTURE_SESSION_CLOSED after close()', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // First capture succeeds
      const result1 = await session.capture(createTestAction('action-1'));
      expect(result1.success).toBe(true);

      // Close the session
      await session.close();

      // Subsequent capture should return session closed error
      const result2 = await session.capture(createTestAction('action-2'));
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.code).toBe('E_CAPTURE_SESSION_CLOSED');
      }
    });

    it('multiple close() calls are idempotent', async () => {
      const session = createCaptureSession({
        store: createInMemorySpoolStore(),
        dedupe: createInMemoryDedupeIndex(),
        hasher: createHasher(),
      });

      // Multiple close calls should not throw
      await session.close();
      await session.close();
      await session.close();

      // Session should remain closed
      const result = await session.capture(createTestAction('action-1'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('E_CAPTURE_SESSION_CLOSED');
      }
    });
  });
});
