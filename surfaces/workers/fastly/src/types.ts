/**
 * @peac/worker-fastly - Fastly-specific types
 *
 * Runtime-specific type definitions for Fastly Compute.
 * Imports shared types from core and extends with Fastly bindings.
 *
 * @packageDocumentation
 */

// Re-export shared types
export type {
  WorkerConfig,
  ReplayContext,
  ReplayStore,
  VerificationResult,
  ProblemDetails,
} from '../../_shared/core/index.js';

/**
 * Fastly Compute environment configuration.
 *
 * Configuration is read from:
 * 1. Edge Dictionary "peac_config" for static config
 * 2. Environment variables via fastly.getEnv()
 *
 * Edge Dictionary keys:
 * - issuer_allowlist: comma-separated issuer origins
 * - bypass_paths: comma-separated bypass path patterns
 * - unsafe_allow_any_issuer: "true" to allow any issuer (dev only)
 * - unsafe_allow_unknown_tags: "true" to allow unknown TAP tags (dev only)
 * - unsafe_allow_no_replay: "true" to skip replay protection (dev only)
 */
export interface FastlyEnv {
  // Required configuration
  ISSUER_ALLOWLIST?: string;
  BYPASS_PATHS?: string;

  // UNSAFE overrides (development only)
  UNSAFE_ALLOW_ANY_ISSUER?: string;
  UNSAFE_ALLOW_UNKNOWN_TAGS?: string;
  UNSAFE_ALLOW_NO_REPLAY?: string;
}

/**
 * Fastly backend configuration.
 */
export interface FastlyBackendConfig {
  /** Backend name for origin requests */
  originBackend: string;
  /** Edge Dictionary name for config */
  configDictName?: string;
  /** KV Store name for replay protection */
  replayKvStore?: string;
}
