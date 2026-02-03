/**
 * @peac/capture-core - Type Definitions
 *
 * Runtime-neutral types for the capture pipeline.
 * NO Node.js APIs, NO fs, NO path - pure types and interfaces only.
 *
 * Filesystem implementations belong in @peac/capture-node.
 */

import type { Digest } from '@peac/schema';

// =============================================================================
// Captured Action (Input to Pipeline)
// =============================================================================

/**
 * Execution status of a captured action.
 */
export type ActionStatus = 'ok' | 'error' | 'timeout' | 'canceled';

/**
 * Policy snapshot at capture time.
 */
export interface PolicySnapshot {
  /** Policy decision that allowed/denied the action */
  decision: 'allow' | 'deny' | 'constrained';
  /** Whether sandbox mode was enabled */
  sandbox_enabled?: boolean;
  /** Whether elevated permissions were granted */
  elevated?: boolean;
  /** Hash of the effective policy document (64 lowercase hex) */
  policy_digest?: string;
}

/**
 * Runtime-neutral captured action.
 *
 * This is the input to the capture pipeline, before any hashing or
 * transformation. Platform-specific adapters convert their events
 * to this common format.
 *
 * IMPORTANT: Timestamps are ISO 8601 strings for deterministic serialization.
 */
export interface CapturedAction {
  /** Stable ID for idempotency/dedupe (REQUIRED) */
  id: string;

  /** Event kind - "tool.call", "http.request", etc. */
  kind: string;

  /** Platform identifier - "openclaw", "mcp", "a2a", "claude-code" */
  platform: string;

  /** Platform version (optional) */
  platform_version?: string;

  /** Plugin that captured this (optional) */
  plugin_id?: string;

  /** Tool name (for tool.call kind) */
  tool_name?: string;

  /** Tool provider (optional) */
  tool_provider?: string;

  /** Resource URI (for http/fs kinds) */
  resource_uri?: string;

  /** HTTP method (for http.request kind) */
  resource_method?: string;

  /** Raw input bytes (will be hashed, then discarded) */
  input_bytes?: Uint8Array;

  /** Raw output bytes (will be hashed, then discarded) */
  output_bytes?: Uint8Array;

  /** Start time (ISO 8601 string for determinism) */
  started_at: string;

  /** Completion time (ISO 8601 string) */
  completed_at?: string;

  /** Duration in milliseconds from monotonic clock */
  duration_ms?: number;

  /** Execution status */
  status?: ActionStatus;

  /** Error code if status is 'error' */
  error_code?: string;

  /** Whether the error is retryable */
  retryable?: boolean;

  /** Policy snapshot at execution time */
  policy?: PolicySnapshot;

  /** Platform-specific metadata (will be stored in extensions) */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Spool Entry (Serializable Record)
// =============================================================================

/**
 * Spool entry - the post-hashing record that can be serialized.
 *
 * This contains computed digests but NOT raw payload bytes (privacy-preserving).
 * The format is deterministic for tamper-evident chaining.
 */
export interface SpoolEntry {
  /** When this entry was captured (RFC 3339) */
  captured_at: string;

  /** The captured action (without raw bytes) */
  action: Omit<CapturedAction, 'input_bytes' | 'output_bytes'>;

  /** Input payload digest (computed inline) */
  input_digest?: Digest;

  /** Output payload digest (computed inline) */
  output_digest?: Digest;

  // Tamper-evident chain fields

  /** Digest of previous entry in spool (chain link) */
  prev_entry_digest: string;

  /** Digest of this entry (for next entry's prev) */
  entry_digest: string;

  /** Sequence number in the spool (monotonic) */
  sequence: number;
}

// =============================================================================
// Spool Store Interface (Abstract - No Implementation)
// =============================================================================

/**
 * Abstract spool storage interface.
 *
 * Implementations handle the actual storage mechanism:
 * - InMemorySpoolStore (for tests, in this package)
 * - FsSpoolStore (in @peac/capture-node)
 * - CloudSpoolStore (future, for serverless)
 */
export interface SpoolStore {
  /**
   * Append an entry to the spool.
   * Returns the assigned sequence number.
   */
  append(entry: SpoolEntry): Promise<number>;

  /**
   * Commit/sync the spool to durable storage.
   * No-op for in-memory stores.
   */
  commit(): Promise<void>;

  /**
   * Read entries starting from a sequence number.
   * Returns entries in order.
   */
  read(fromSequence: number, limit?: number): Promise<SpoolEntry[]>;

  /**
   * Get the current head digest (last entry's digest).
   * Returns genesis digest if spool is empty.
   */
  getHeadDigest(): Promise<string>;

  /**
   * Get the current sequence number (last entry's sequence).
   * Returns 0 if spool is empty.
   */
  getSequence(): Promise<number>;

  /**
   * Close the store and release resources.
   */
  close(): Promise<void>;
}

// =============================================================================
// Dedupe Index Interface (Abstract - No Implementation)
// =============================================================================

/**
 * Dedupe entry - tracks captured actions to prevent duplicates.
 */
export interface DedupeEntry {
  /** Sequence number in spool */
  sequence: number;

  /** Entry digest for verification */
  entry_digest: string;

  /** When the action was captured */
  captured_at: string;

  /** Whether a receipt has been emitted */
  emitted: boolean;
}

/**
 * Abstract dedupe index interface.
 *
 * All methods are async to support durable backends (sqlite, kv, etc.)
 * without forcing implementers to use sync filesystem calls.
 *
 * Implementations handle the actual storage:
 * - InMemoryDedupeIndex (for tests, in this package)
 * - PersistentDedupeIndex (in @peac/capture-node)
 */
export interface DedupeIndex {
  /** Get entry by action ID */
  get(actionId: string): Promise<DedupeEntry | undefined>;

  /** Set entry for action ID */
  set(actionId: string, entry: DedupeEntry): Promise<void>;

  /** Check if action ID exists */
  has(actionId: string): Promise<boolean>;

  /** Mark an entry as emitted */
  markEmitted(actionId: string): Promise<boolean>;

  /** Delete entry (for cleanup) */
  delete(actionId: string): Promise<boolean>;

  /** Get count of entries */
  size(): Promise<number>;

  /** Clear all entries */
  clear(): Promise<void>;
}

// =============================================================================
// Hasher Interface
// =============================================================================

/**
 * Hasher configuration.
 */
export interface HasherConfig {
  /** Maximum bytes to hash before truncating (default: 1MB) */
  truncateThreshold?: number;
}

/**
 * Hasher interface for computing payload digests.
 */
export interface Hasher {
  /**
   * Compute digest for payload bytes.
   * Automatically truncates if payload exceeds threshold.
   */
  digest(payload: Uint8Array): Promise<Digest>;

  /**
   * Compute digest for a spool entry (for chaining).
   * Uses deterministic serialization (JCS).
   */
  digestEntry(entry: Omit<SpoolEntry, 'entry_digest'>): Promise<string>;
}

// =============================================================================
// Capture Session Interface
// =============================================================================

/**
 * Capture session configuration.
 */
export interface CaptureSessionConfig {
  /** Spool store implementation */
  store: SpoolStore;

  /** Dedupe index implementation */
  dedupe: DedupeIndex;

  /** Hasher implementation */
  hasher: Hasher;
}

/**
 * Capture result for a single action.
 */
export type CaptureResult =
  | { success: true; entry: SpoolEntry }
  | { success: false; code: CaptureErrorCode; message: string };

/**
 * Capture error codes.
 *
 * Layer-separated error codes:
 * - E_CAPTURE_* codes are for capture pipeline failures, NOT schema validation
 * - E_INTERACTION_* codes (in @peac/schema) are for receipt/profile validation
 */
export type CaptureErrorCode =
  | 'E_CAPTURE_DUPLICATE'
  | 'E_CAPTURE_HASH_FAILED'
  | 'E_CAPTURE_STORE_FAILED'
  | 'E_CAPTURE_INVALID_ACTION'
  | 'E_CAPTURE_SESSION_CLOSED'
  | 'E_CAPTURE_INTERNAL';

/**
 * Capture session - stateful capture pipeline instance.
 */
export interface CaptureSession {
  /**
   * Capture an action.
   * Returns success with entry, or failure with error code.
   */
  capture(action: CapturedAction): Promise<CaptureResult>;

  /**
   * Commit any pending writes to durable storage.
   */
  commit(): Promise<void>;

  /**
   * Get the current spool head digest.
   */
  getHeadDigest(): Promise<string>;

  /**
   * Close the session and release resources.
   */
  close(): Promise<void>;
}

// =============================================================================
// Spool Anchor (for External Verifiability)
// =============================================================================

/**
 * Spool anchor extension data.
 *
 * When included in a receipt, this allows external verifiers to
 * check the spool chain without access to the full spool file.
 */
export interface SpoolAnchor {
  /** Current head digest of the spool chain */
  spool_head_digest: string;

  /** Sequence number in the spool */
  sequence: number;

  /** Timestamp of the anchor */
  anchored_at: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Genesis digest - the "prev" digest for the first entry in a spool.
 * 64 zeros represents "no previous entry".
 */
export const GENESIS_DIGEST = '0'.repeat(64);

/**
 * Default truncation threshold: 1MB (1024 * 1024 bytes).
 */
export const DEFAULT_TRUNCATE_THRESHOLD = 1024 * 1024;

/**
 * Size constants for truncation algorithms.
 */
export const SIZE_CONSTANTS = {
  K: 1024, // 1 KB
  M: 1024 * 1024, // 1 MB
  TRUNC_64K: 64 * 1024, // 64 KB
  TRUNC_1M: 1024 * 1024, // 1 MB
} as const;
