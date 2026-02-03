/**
 * @peac/capture-core
 *
 * Runtime-neutral capture pipeline for PEAC interaction evidence.
 *
 * This package provides:
 * - Types for captured actions and spool entries
 * - Interfaces for storage (SpoolStore) and deduplication (DedupeIndex)
 * - Hasher for deterministic payload hashing
 * - Mapper for converting to InteractionEvidence
 * - CaptureSession for orchestrating the pipeline
 *
 * NO FILESYSTEM OPERATIONS - those belong in @peac/capture-node.
 *
 * For in-memory test implementations, import from '@peac/capture-core/testkit'.
 *
 * @example
 * ```typescript
 * import {
 *   createCaptureSession,
 *   createHasher,
 *   toInteractionEvidence,
 * } from '@peac/capture-core';
 * import {
 *   createInMemorySpoolStore,
 *   createInMemoryDedupeIndex,
 * } from '@peac/capture-core/testkit';
 *
 * const session = createCaptureSession({
 *   store: createInMemorySpoolStore(),
 *   dedupe: createInMemoryDedupeIndex(),
 *   hasher: createHasher(),
 * });
 *
 * const result = await session.capture({
 *   id: 'action-123',
 *   kind: 'tool.call',
 *   platform: 'my-platform',
 *   started_at: new Date().toISOString(),
 *   tool_name: 'search',
 * });
 *
 * if (result.success) {
 *   const evidence = toInteractionEvidence(result.entry);
 * }
 * ```
 */

// =============================================================================
// Types (public API)
// =============================================================================

export type {
  // Core types
  CapturedAction,
  ActionStatus,
  PolicySnapshot,
  SpoolEntry,

  // Interfaces
  SpoolStore,
  DedupeIndex,
  DedupeEntry,
  Hasher,
  HasherConfig,
  CaptureSession,
  CaptureSessionConfig,

  // Results
  CaptureResult,
  CaptureErrorCode,

  // Anchor
  SpoolAnchor,
} from './types';

// =============================================================================
// Constants (public API)
// =============================================================================

export { GENESIS_DIGEST, SIZE_CONSTANTS } from './types';

// =============================================================================
// Hasher (public API)
// =============================================================================

export { ActionHasher, createHasher } from './hasher';

// =============================================================================
// Mapper (public API)
// =============================================================================

export { toInteractionEvidence, toInteractionEvidenceBatch } from './mapper';
export type { MapperOptions } from './mapper';

// =============================================================================
// Session (public API)
// =============================================================================

export { DefaultCaptureSession, createCaptureSession } from './session';
