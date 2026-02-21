/**
 * PEAC Shared Worker Core - Types
 *
 * Runtime-neutral type definitions for edge worker verification.
 * These types are implemented by each runtime (Cloudflare, Fastly, Akamai).
 *
 * @packageDocumentation
 */

import type { TapControlEntry, TapKeyResolver } from '@peac/mappings-tap';

/**
 * Worker configuration parsed from environment.
 *
 * Security defaults (fail-closed):
 * - ISSUER_ALLOWLIST is REQUIRED (unless unsafeAllowAnyIssuer=true)
 * - Unknown TAP tags are REJECTED (unless unsafeAllowUnknownTags=true)
 * - Replay protection is REQUIRED when nonce present (unless unsafeAllowNoReplay=true)
 */
export interface WorkerConfig {
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
 * - Durable Objects: Strong consistency, atomic (enterprise)
 * - D1: Strong consistency via SQLite transactions
 * - KV: Eventual consistency, best-effort only (NOT atomic)
 * - LRU: In-memory, best-effort (for serverless like Next.js)
 */
export interface ReplayStore {
  /**
   * Check if nonce has been seen.
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
 * RFC 9457 Problem Details object.
 *
 * Structured error response format for API errors.
 */
export interface ProblemDetails {
  /** Problem type URI */
  type: string;
  /** Short, human-readable summary */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation */
  detail?: string;
  /** URI reference identifying the specific occurrence */
  instance?: string;
  /** Stable error code extension */
  code?: string;
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
 * Options for TAP verification.
 */
export interface VerifyTapOptions {
  /** JWKS key resolver - same type as TapKeyResolver from @peac/mappings-tap */
  keyResolver: TapKeyResolver;
  /** Replay store (null if not configured) */
  replayStore: ReplayStore | null;
  /** UNSAFE: Allow unknown TAP tags */
  unsafeAllowUnknownTags: boolean;
  /** UNSAFE: Allow requests without replay protection */
  unsafeAllowNoReplay: boolean;
  /** Callback when no replay store is configured (for warnings) */
  warnNoReplayStore: () => void;
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
