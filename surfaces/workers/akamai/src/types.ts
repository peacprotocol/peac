/**
 * @peac/worker-akamai - Akamai-specific types
 *
 * Runtime-specific type definitions for Akamai EdgeWorkers.
 * Imports shared types from core and extends with Akamai bindings.
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
 * Akamai EdgeWorkers environment configuration.
 *
 * Configuration is read from:
 * 1. Property Manager variables (PMUSER_*)
 * 2. EdgeKV for dynamic config
 *
 * Property Manager variables:
 * - PMUSER_ISSUER_ALLOWLIST: comma-separated issuer origins
 * - PMUSER_BYPASS_PATHS: comma-separated bypass path patterns
 * - PMUSER_UNSAFE_ALLOW_ANY_ISSUER: "true" to allow any issuer (dev only)
 * - PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS: "true" to allow unknown TAP tags (dev only)
 * - PMUSER_UNSAFE_ALLOW_NO_REPLAY: "true" to skip replay protection (dev only)
 */
export interface AkamaiEnv {
  // Required configuration
  PMUSER_ISSUER_ALLOWLIST?: string;
  PMUSER_BYPASS_PATHS?: string;

  // UNSAFE overrides (development only)
  PMUSER_UNSAFE_ALLOW_ANY_ISSUER?: string;
  PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS?: string;
  PMUSER_UNSAFE_ALLOW_NO_REPLAY?: string;
}

/**
 * Akamai EdgeKV configuration.
 */
export interface EdgeKVConfig {
  /** EdgeKV namespace for replay protection */
  namespace: string;
  /** EdgeKV group for replay keys */
  group: string;
}

/**
 * Akamai EdgeWorkers request interface (subset).
 */
export interface EWRequest {
  method: string;
  scheme: string;
  host: string;
  path: string;
  query: string;
  getHeader(name: string): string[] | null;
  getHeaders(): { [key: string]: string[] };
  getVariable(name: string): string | undefined;
}

/**
 * Akamai EdgeWorkers response interface (subset).
 */
export interface EWResponse {
  status: number;
  setHeader(name: string, value: string | string[]): void;
}

/**
 * Akamai EdgeWorkers request handler.
 */
export interface EWRequestHandler {
  respondWith(
    status: number,
    headers: { [key: string]: string | string[] },
    body: string,
    denyReason?: string
  ): void;
}
