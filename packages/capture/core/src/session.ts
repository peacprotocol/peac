/**
 * @peac/capture-core - Capture Session
 *
 * Stateful capture pipeline that orchestrates hashing, deduplication,
 * and spool storage.
 */

import type {
  CaptureSession,
  CaptureSessionConfig,
  CapturedAction,
  CaptureResult,
  SpoolEntry,
  Hasher,
  SpoolStore,
  DedupeIndex,
} from './types';

// =============================================================================
// Capture Session Implementation
// =============================================================================

/**
 * Default capture session implementation.
 *
 * Orchestrates:
 * 1. Deduplication check
 * 2. Payload hashing (input/output)
 * 3. Entry creation with chain linking
 * 4. Spool storage
 * 5. Dedupe index update
 */
export class DefaultCaptureSession implements CaptureSession {
  private readonly store: SpoolStore;
  private readonly dedupe: DedupeIndex;
  private readonly hasher: Hasher;
  private closed: boolean = false;

  // Concurrency serialization: queue captures to prevent race conditions
  // on sequence numbers and chain linkage
  private captureQueue: Promise<void> = Promise.resolve();

  constructor(config: CaptureSessionConfig) {
    this.store = config.store;
    this.dedupe = config.dedupe;
    this.hasher = config.hasher;
  }

  /**
   * Capture an action.
   *
   * Process:
   * 1. Validate action
   * 2. Serialize via queue (prevents race conditions)
   * 3. Check for duplicate (by action.id)
   * 4. Hash input/output payloads
   * 5. Create spool entry with chain link
   * 6. Append to spool
   * 7. Update dedupe index
   *
   * Concurrency: Capture calls are serialized to prevent race conditions
   * on sequence numbers and chain linkage.
   *
   * GUARANTEE: This method NEVER throws. All failures are returned as
   * CaptureResult with success=false. This ensures the capture queue
   * remains healthy and subsequent captures can proceed.
   */
  async capture(action: CapturedAction): Promise<CaptureResult> {
    try {
      // Check session state (convert throw to result)
      if (this.closed) {
        return {
          success: false,
          code: 'E_CAPTURE_SESSION_CLOSED',
          message: 'CaptureSession is closed',
        };
      }

      // 1. Validate action (can run before serialization)
      const validationError = this.validateAction(action);
      if (validationError) {
        return {
          success: false,
          code: 'E_CAPTURE_INVALID_ACTION',
          message: validationError,
        };
      }

      // 2. Serialize capture operations to prevent race conditions
      let result: CaptureResult;
      const capturePromise = this.captureQueue.then(async () => {
        result = await this.captureInternal(action);
      });

      // Keep queue alive regardless of outcome
      this.captureQueue = capturePromise.catch(() => {
        // Swallow errors to keep queue alive for subsequent captures
      });

      // Await result, but catch any unexpected throws
      await capturePromise;

      return result!;
    } catch (error) {
      // Last-resort catch: convert ANY unexpected throw to CaptureResult
      // This should never happen if captureInternal is correct, but provides safety
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        code: 'E_CAPTURE_INTERNAL',
        message: `Internal capture error: ${message}`,
      };
    }
  }

  /**
   * Internal capture logic (runs serialized).
   *
   * IMPORTANT: This method must NEVER throw - it always returns CaptureResult.
   * This is critical for queue safety: if this throws, the queue chain would
   * propagate the rejection to the caller while the queue itself stays healthy.
   */
  private async captureInternal(action: CapturedAction): Promise<CaptureResult> {
    try {
      // 3. Check for duplicate (inside try/catch for queue safety)
      if (await this.dedupe.has(action.id)) {
        return {
          success: false,
          code: 'E_CAPTURE_DUPLICATE',
          message: `Action ${action.id} already captured`,
        };
      }
      // 4. Hash payloads
      const inputDigest = action.input_bytes
        ? await this.hasher.digest(action.input_bytes)
        : undefined;

      const outputDigest = action.output_bytes
        ? await this.hasher.digest(action.output_bytes)
        : undefined;

      // 5. Get current chain state
      const prevDigest = await this.store.getHeadDigest();
      const sequence = (await this.store.getSequence()) + 1;

      // 6. Build entry (without entry_digest)
      // DETERMINISM: Derive captured_at from action timestamps, not wall clock.
      // This ensures the same action stream produces identical chain digests.
      const capturedAt = action.completed_at ?? action.started_at;
      const partialEntry: Omit<SpoolEntry, 'entry_digest'> = {
        captured_at: capturedAt,
        action: this.stripPayloadBytes(action),
        input_digest: inputDigest,
        output_digest: outputDigest,
        prev_entry_digest: prevDigest,
        sequence,
      };

      // 7. Compute entry digest
      const entryDigest = await this.hasher.digestEntry(partialEntry);

      // 8. Complete entry
      const entry: SpoolEntry = {
        ...partialEntry,
        entry_digest: entryDigest,
      };

      // 9. Append to spool
      await this.store.append(entry);

      // 10. Update dedupe index
      await this.dedupe.set(action.id, {
        sequence,
        entry_digest: entryDigest,
        captured_at: capturedAt,
        emitted: false,
      });

      return { success: true, entry };
    } catch (error) {
      // Determine error type
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('hash') || message.includes('digest')) {
        return {
          success: false,
          code: 'E_CAPTURE_HASH_FAILED',
          message: `Hash failed: ${message}`,
        };
      }

      return {
        success: false,
        code: 'E_CAPTURE_STORE_FAILED',
        message: `Store failed: ${message}`,
      };
    }
  }

  /**
   * Commit pending writes to durable storage.
   */
  async commit(): Promise<void> {
    this.assertNotClosed();
    await this.store.commit();
  }

  /**
   * Get the current spool head digest.
   */
  async getHeadDigest(): Promise<string> {
    this.assertNotClosed();
    return this.store.getHeadDigest();
  }

  /**
   * Close the session and release resources.
   */
  async close(): Promise<void> {
    if (!this.closed) {
      await this.store.close();
      this.closed = true;
    }
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  /**
   * Validate action has required fields.
   */
  private validateAction(action: CapturedAction): string | null {
    if (!action.id || action.id.trim() === '') {
      return 'Missing action.id';
    }

    if (!action.kind || action.kind.trim() === '') {
      return 'Missing action.kind';
    }

    if (!action.platform || action.platform.trim() === '') {
      return 'Missing action.platform';
    }

    if (!action.started_at || action.started_at.trim() === '') {
      return 'Missing action.started_at';
    }

    return null;
  }

  /**
   * Strip payload bytes from action for storage.
   */
  private stripPayloadBytes(
    action: CapturedAction
  ): Omit<CapturedAction, 'input_bytes' | 'output_bytes'> {
    const { input_bytes, output_bytes, ...rest } = action;
    return rest;
  }

  /**
   * Assert session is not closed.
   */
  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('CaptureSession is closed');
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a capture session.
 */
export function createCaptureSession(config: CaptureSessionConfig): CaptureSession {
  return new DefaultCaptureSession(config);
}
