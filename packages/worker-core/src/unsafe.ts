/**
 * @peac/worker-core/unsafe - Unsafe API (Development Only)
 *
 * WARNING: These APIs bypass security controls and are NOT safe for production.
 * Only use for local development and testing.
 *
 * Unsafe options include:
 * - UNSAFE_ALLOW_ANY_ISSUER: Skip issuer allowlist validation
 * - UNSAFE_ALLOW_UNKNOWN_TAGS: Accept unknown TAP tags
 * - UNSAFE_ALLOW_NO_REPLAY: Skip replay protection when nonce present
 *
 * @packageDocumentation
 */

// Re-export safe API for convenience
export * from './index.js';

// -----------------------------------------------------------------------------
// Unsafe Types
// -----------------------------------------------------------------------------

export type {
  UnsafeWorkerConfig,
  InternalWorkerConfig,
  InternalVerifyTapOptions,
} from './types.js';

// -----------------------------------------------------------------------------
// Unsafe Configuration
// -----------------------------------------------------------------------------

export { parseUnsafeConfigFromEnv } from './config.js';
