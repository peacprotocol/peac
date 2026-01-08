/**
 * PEAC Worker Core - Type Definitions
 *
 * Split into Safe (public API) and Unsafe (dev-only) types.
 *
 * @packageDocumentation
 */

import type { TapControlEntry, TapKeyResolver } from '@peac/mappings-tap';
import type { ProblemDetails } from './errors.js';

// Re-export TapControlEntry and TapKeyResolver for convenience
export type { TapControlEntry, TapKeyResolver } from '@peac/mappings-tap';

// =============================================================================
// SAFE TYPES (exported from @peac/worker-core)
// =============================================================================

/**
 * Safe worker configuration.
 *
 * This config has NO unsafe flags - security is enforced by default.
 * Used by the safe `createHandler()` factory.
 */
export interface SafeWorkerConfig {
  /** List of allowed issuer origins (REQUIRED, non-empty) */
  issuerAllowlist: string[];
  /** Paths to bypass verification */
  bypassPaths: string[];
}

/**
 * Context for replay detection.
 *
 * Used to check if a nonce has been seen before within the TTL window.
 */
export interface ReplayContext {
  /** Issuer origin (extracted from keyid) */
  issuer: string;
  /** JWKS key identifier */
  keyid: string;
  /** TAP nonce value */
  nonce: string;
  /** TTL in seconds for replay window */
  ttlSeconds: number;
}

/**
 * Replay store interface.
 *
 * Implementations provide different consistency guarantees:
 * - LRU: In-memory, best-effort (for serverless like Next.js)
 * - D1: Strong consistency via SQLite transactions
 * - KV: Eventual consistency, best-effort only (NOT atomic)
 * - Durable Objects: Strong consistency, atomic (enterprise)
 */
export interface ReplayStore {
  /**
   * Check if nonce has been seen and mark as seen atomically.
   *
   * @param ctx - Replay context with issuer, keyid, nonce, and TTL
   * @returns true if this is a replay (nonce was seen before), false otherwise
   */
  seen(ctx: ReplayContext): Promise<boolean>;
}

/**
 * TAP verification result.
 *
 * Contains verification outcome, error details, and control entry if valid.
 */
export interface VerificationResult {
  /** Whether verification succeeded */
  valid: boolean;
  /** Whether request had TAP headers */
  isTap: boolean;
  /** Stable error code for programmatic handling */
  errorCode?: string;
  /** Human-readable error message */
  errorMessage?: string;
  /** TAP control entry if verification succeeded */
  controlEntry?: TapControlEntry;
}


/**
 * Headers-like interface for runtime neutrality.
 *
 * Works with any platform's Headers implementation.
 */
export interface HeadersLike {
  get(name: string): string | null;
  entries(): IterableIterator<[string, string]>;
}

/**
 * Request-like interface for runtime neutrality.
 *
 * Works with any platform's Request implementation.
 */
export interface RequestLike {
  method: string;
  url: string;
  headers: HeadersLike;
}

/**
 * Handler result for runtime-neutral response creation.
 *
 * Runtimes convert this to their platform-specific Response type.
 */
export interface HandlerResult {
  /** Action to take */
  action: 'pass' | 'challenge' | 'error' | 'forward';
  /** HTTP status code (for error/challenge) */
  status?: number;
  /** Error code (for error responses) */
  errorCode?: string;
  /** Error detail (for error responses) */
  errorDetail?: string;
  /** Problem details (for error responses) */
  problem?: ProblemDetails;
  /** Request URL (for instance field) */
  requestUrl?: string;
  /** Control entry (for successful verification) */
  controlEntry?: TapControlEntry;
  /** Warning to include in response headers */
  warning?: string;
}

/**
 * Options for creating a safe handler.
 */
export interface CreateHandlerOptions {
  /** Environment variables (optional if config provided) */
  env?: Record<string, string | undefined>;
  /** Explicit config (optional if env provided) */
  config?: SafeWorkerConfig;
  /** JWKS key resolver */
  keyResolver: TapKeyResolver;
  /** Replay store (recommended for production) */
  replayStore?: ReplayStore;
}

/**
 * Worker handler function type.
 */
export type WorkerHandler = (request: RequestLike) => Promise<HandlerResult>;

// =============================================================================
// INTERNAL TYPES (not exported from main entrypoint)
// =============================================================================

/**
 * INTERNAL: Full config used by verification logic.
 *
 * Includes unsafe flags that are only set via the unsafe API.
 */
export interface InternalWorkerConfig {
  issuerAllowlist: string[];
  bypassPaths: string[];
  unsafeAllowAnyIssuer: boolean;
  unsafeAllowUnknownTags: boolean;
  unsafeAllowNoReplay: boolean;
}

/**
 * INTERNAL: TAP verification options.
 *
 * Includes unsafe flags passed through from config.
 */
export interface InternalVerifyTapOptions {
  keyResolver: TapKeyResolver;
  replayStore: ReplayStore | null;
  unsafeAllowUnknownTags: boolean;
  unsafeAllowNoReplay: boolean;
  warnNoReplayStore: () => void;
}

// =============================================================================
// UNSAFE TYPES (exported from @peac/worker-core/unsafe)
// =============================================================================

/**
 * Unsafe worker configuration.
 *
 * Includes escape hatches for development/testing.
 * These options disable security checks and MUST NOT be used in production.
 */
export interface UnsafeWorkerConfig {
  /** List of allowed issuer origins */
  issuerAllowlist: string[];
  /** Paths to bypass verification */
  bypassPaths: string[];
  /** UNSAFE: Allow any issuer (dev only) */
  unsafeAllowAnyIssuer: boolean;
  /** UNSAFE: Allow unknown TAP tags (dev only) */
  unsafeAllowUnknownTags: boolean;
  /** UNSAFE: Allow requests without replay protection (dev only) */
  unsafeAllowNoReplay: boolean;
}

/**
 * Options for creating an unsafe handler.
 */
export interface CreateHandlerUnsafeOptions {
  /** Environment variables (optional if config provided) */
  env?: Record<string, string | undefined>;
  /** Explicit config (optional if env provided) */
  config?: UnsafeWorkerConfig;
  /** JWKS key resolver */
  keyResolver: TapKeyResolver;
  /** Replay store (optional in unsafe mode) */
  replayStore?: ReplayStore;
}
