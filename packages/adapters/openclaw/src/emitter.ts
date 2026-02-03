/**
 * @peac/adapter-openclaw - Background Emitter
 *
 * Background service for converting captured actions to signed PEAC receipts.
 * Runs asynchronously to avoid blocking the sync capture path.
 */

import type { SpoolEntry } from '@peac/capture-core';
import { toInteractionEvidence } from '@peac/capture-core';
import type { ReceiptEmitter, EmitResult, OpenClawAdapterConfig } from './types.js';
import { OPENCLAW_ERROR_CODES } from './types.js';

// =============================================================================
// Signer Interface
// =============================================================================

/**
 * Signer interface for receipt signing.
 *
 * Different implementations can support various key storage mechanisms:
 * - Level 1: Environment variable (dev only)
 * - Level 2: OS Keychain
 * - Level 3: Sidecar process
 * - Level 4: Hardware module (YubiKey, TPM, HSM)
 */
export interface Signer {
  /** Sign a payload and return JWS */
  sign(payload: unknown): Promise<string>;

  /** Get the key ID (kid) for the current signing key */
  getKeyId(): string;

  /** Get the issuer URI */
  getIssuer(): string;

  /** Get the audience URI (optional) */
  getAudience(): string | undefined;
}

// =============================================================================
// Receipt Writer Interface
// =============================================================================

/**
 * Receipt writer interface for persisting signed receipts.
 */
export interface ReceiptWriter {
  /** Write a signed receipt */
  write(receipt: SignedReceipt): Promise<string>;

  /** Close the writer */
  close(): Promise<void>;
}

/**
 * Signed receipt ready for persistence.
 */
export interface SignedReceipt {
  /** Receipt ID (rid) */
  rid: string;

  /** JWS compact serialization */
  jws: string;

  /** Interaction ID (for correlation) */
  interaction_id: string;

  /** Entry digest (for verification) */
  entry_digest: string;
}

// =============================================================================
// Emitter Implementation
// =============================================================================

/**
 * Configuration for creating a receipt emitter.
 */
export interface EmitterConfig {
  /** Signer for receipt signing */
  signer: Signer;

  /** Writer for receipt persistence */
  writer: ReceiptWriter;

  /** Adapter configuration */
  config?: OpenClawAdapterConfig;

  /** Callback for emit events */
  onEmit?: (result: EmitResult, entry: SpoolEntry) => void;

  /** Callback for emit errors */
  onError?: (error: Error, entry: SpoolEntry) => void;
}

/**
 * Create a receipt emitter.
 *
 * @param emitterConfig - Configuration for the emitter
 * @returns Receipt emitter instance
 */
export function createReceiptEmitter(emitterConfig: EmitterConfig): ReceiptEmitter {
  const { signer, writer, onEmit, onError } = emitterConfig;

  let closed = false;

  return {
    async emit(entry: SpoolEntry): Promise<EmitResult> {
      if (closed) {
        return {
          success: false,
          error_code: 'E_EMITTER_CLOSED',
          error_message: 'Emitter has been closed',
        };
      }

      try {
        // Convert SpoolEntry to InteractionEvidence
        // Note: Platform info is already in the entry.action from the mapper
        const interaction = toInteractionEvidence(entry);

        // Build the receipt payload
        const receiptPayload = buildReceiptPayload(interaction, entry, signer);

        // Sign the receipt
        const jws = await signer.sign(receiptPayload);

        // Build signed receipt
        const signedReceipt: SignedReceipt = {
          rid: receiptPayload.rid,
          jws,
          interaction_id: entry.action.id,
          entry_digest: entry.entry_digest,
        };

        // Write the receipt
        const receiptPath = await writer.write(signedReceipt);

        const result: EmitResult = {
          success: true,
          receipt_path: receiptPath,
          receipt_id: receiptPayload.rid,
        };

        if (onEmit) {
          onEmit(result, entry);
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage), entry);
        }

        return {
          success: false,
          error_code: OPENCLAW_ERROR_CODES.SIGNING_FAILED,
          error_message: `Failed to emit receipt: ${errorMessage}`,
        };
      }
    },

    async flush(): Promise<void> {
      // No-op: entries are emitted immediately via emit()
      // This method exists for API consistency
    },

    async close(): Promise<void> {
      closed = true;
      await writer.close();
    },
  };
}

// =============================================================================
// Receipt Payload Builder
// =============================================================================

/**
 * PEAC receipt payload structure.
 */
interface ReceiptPayload {
  /** Issuer */
  iss: string;

  /** Audience */
  aud?: string;

  /** Issued at (Unix timestamp) */
  iat: number;

  /** Receipt ID */
  rid: string;

  /** Evidence block */
  evidence: {
    extensions: {
      'org.peacprotocol/interaction@0.1': unknown;
    };
  };
}

/**
 * Build the receipt payload from interaction evidence.
 */
function buildReceiptPayload(
  interaction: ReturnType<typeof toInteractionEvidence>,
  entry: SpoolEntry,
  signer: Signer
): ReceiptPayload {
  const now = Math.floor(Date.now() / 1000);
  const rid = generateReceiptId(entry.entry_digest);

  const payload: ReceiptPayload = {
    iss: signer.getIssuer(),
    iat: now,
    rid,
    evidence: {
      extensions: {
        'org.peacprotocol/interaction@0.1': interaction,
      },
    },
  };

  const audience = signer.getAudience();
  if (audience) {
    payload.aud = audience;
  }

  return payload;
}

/**
 * Generate a deterministic receipt ID from entry digest.
 *
 * Using a deterministic ID (derived from entry_digest) provides:
 * - Idempotency: same entry always produces same rid
 * - Replay safety: retries don't create duplicates
 * - Correlation: rid can be traced back to spool entry
 *
 * Format: r_{first 32 chars of entry_digest}
 */
function generateReceiptId(entryDigest: string): string {
  // Use first 32 chars of entry digest for reasonable uniqueness
  // while keeping the ID short enough for practical use
  return `r_${entryDigest.slice(0, 32)}`;
}

// =============================================================================
// Background Service
// =============================================================================

/**
 * Background emitter service that periodically drains a spool.
 */
export interface BackgroundEmitterService {
  /** Start the background service */
  start(): void;

  /** Stop the background service */
  stop(): void;

  /** Trigger immediate drain */
  drain(): Promise<void>;

  /** Whether the service is running */
  isRunning(): boolean;

  /** Get emit statistics */
  getStats(): EmitterStats;
}

/**
 * Emitter statistics.
 */
export interface EmitterStats {
  /** Total entries emitted */
  emitted: number;

  /** Total entries failed */
  failed: number;

  /** Last emit time */
  lastEmitTime?: Date;

  /** Last error */
  lastError?: string;
}

/**
 * Configuration for background emitter service.
 */
export interface BackgroundServiceConfig {
  /** Receipt emitter */
  emitter: ReceiptEmitter;

  /** Function to get pending spool entries */
  getPendingEntries: () => Promise<SpoolEntry[]>;

  /** Function to mark entry as emitted */
  markEmitted: (entryDigest: string) => Promise<void>;

  /** Drain interval in milliseconds (default: 1000) */
  drainIntervalMs?: number;

  /** Callback for service errors */
  onError?: (error: Error) => void;
}

/**
 * Create a background emitter service.
 *
 * @param serviceConfig - Configuration for the service
 * @returns Background emitter service instance
 */
export function createBackgroundService(
  serviceConfig: BackgroundServiceConfig
): BackgroundEmitterService {
  const {
    emitter,
    getPendingEntries,
    markEmitted,
    drainIntervalMs = 1000,
    onError,
  } = serviceConfig;

  let running = false;
  let stopping = false;
  let inFlight = false;
  let intervalHandle: ReturnType<typeof setInterval> | undefined;
  const stats: EmitterStats = {
    emitted: 0,
    failed: 0,
  };

  const drainOnce = async () => {
    // Prevent overlapping drains - if a drain takes longer than the
    // interval, skip this tick rather than double-processing
    if (inFlight) return;

    inFlight = true;
    try {
      const entries = await getPendingEntries();

      for (const entry of entries) {
        // Check if service is being stopped during processing
        if (stopping) break;

        const result = await emitter.emit(entry);

        if (result.success) {
          await markEmitted(entry.entry_digest);
          stats.emitted++;
          stats.lastEmitTime = new Date();
        } else {
          stats.failed++;
          stats.lastError = result.error_message;
        }
      }
    } catch (error) {
      stats.lastError = error instanceof Error ? error.message : String(error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      inFlight = false;
    }
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      intervalHandle = setInterval(drainOnce, drainIntervalMs);
      // Run immediately on start
      drainOnce();
    },

    stop(): void {
      if (!running) return;
      stopping = true;
      running = false;
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = undefined;
      }
    },

    async drain(): Promise<void> {
      await drainOnce();
    },

    isRunning(): boolean {
      return running;
    },

    getStats(): EmitterStats {
      return { ...stats };
    },
  };
}
