/**
 * @peac/capture-node - Node.js Durable Storage
 *
 * Filesystem implementations of SpoolStore and DedupeIndex from @peac/capture-core.
 * Layer 1.5: depends on capture-core (L1), used by adapters (L4) and apps (L5).
 */

// Factories (primary API)
export { createFsSpoolStore } from './fs-spool-store.js';
export { createFsDedupeIndex } from './fs-dedupe-index.js';

// Classes (for type guards and instanceof checks)
export { FsSpoolStore } from './fs-spool-store.js';
export { FsDedupeIndex } from './fs-dedupe-index.js';

// Diagnostics helper (type-guard-based access to FsSpoolStore diagnostics)
export { getFsSpoolDiagnostics } from './fs-spool-store.js';

// Options and diagnostics types
export type { FsSpoolStoreOptions, SpoolDiagnostics } from './fs-spool-store.js';
export type { FsDedupeIndexOptions } from './fs-dedupe-index.js';

// Error types
export { SpoolFullError, SpoolCorruptError, LockfileError } from './errors.js';
export type { CorruptReason } from './errors.js';

// Lockfile utilities
export { acquireLock } from './lockfile.js';
export type { LockOptions, LockHandle } from './lockfile.js';
