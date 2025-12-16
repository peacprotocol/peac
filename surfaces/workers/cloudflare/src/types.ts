/**
 * @peac/worker-cloudflare - Type definitions
 *
 * Cloudflare Worker for PEAC receipt verification.
 */

import type { TapControlEntry } from '@peac/mappings-tap';

/**
 * Worker environment bindings.
 *
 * Security defaults:
 * - ISSUER_ALLOWLIST is REQUIRED (fail-closed unless UNSAFE_ALLOW_ANY_ISSUER=true)
 * - Unknown TAP tags are REJECTED (unless UNSAFE_ALLOW_UNKNOWN_TAGS=true)
 * - Replay protection is REQUIRED when nonce present (unless UNSAFE_ALLOW_NO_REPLAY=true)
 */
export interface Env {
  /** Comma-separated list of allowed issuers (REQUIRED for production) */
  ISSUER_ALLOWLIST?: string;

  /** Comma-separated list of bypass paths (glob patterns) */
  BYPASS_PATHS?: string;

  /** UNSAFE: Allow any issuer when ISSUER_ALLOWLIST is empty (default: false) */
  UNSAFE_ALLOW_ANY_ISSUER?: string;

  /** UNSAFE: Allow unknown TAP tags (default: false - fail-closed) */
  UNSAFE_ALLOW_UNKNOWN_TAGS?: string;

  /** UNSAFE: Allow requests without replay protection (default: false) */
  UNSAFE_ALLOW_NO_REPLAY?: string;

  /** KV namespace for best-effort replay protection */
  REPLAY_KV?: KVNamespace;

  /** Durable Object for strong replay protection */
  REPLAY_DO?: DurableObjectNamespace;

  /** D1 database for replay protection */
  REPLAY_D1?: D1Database;
}

/**
 * Worker configuration derived from environment.
 *
 * Security: All UNSAFE_* flags default to false (fail-closed).
 */
export interface WorkerConfig {
  /** Allowed issuer origins */
  issuerAllowlist: string[];

  /** Bypass path patterns */
  bypassPaths: string[];

  /** UNSAFE: Allow any issuer when allowlist is empty (default: false) */
  unsafeAllowAnyIssuer: boolean;

  /** UNSAFE: Allow unknown TAP tags (default: false - fail-closed) */
  unsafeAllowUnknownTags: boolean;

  /** UNSAFE: Allow requests without replay protection (default: false) */
  unsafeAllowNoReplay: boolean;
}

/**
 * Context for replay detection.
 *
 * Used to create a hashed key that prevents correlation
 * while still detecting replays per issuer/key/nonce tuple.
 */
export interface ReplayContext {
  /** Issuer origin (e.g., "https://issuer.example.com") */
  issuer: string;

  /** Key ID from the signature */
  keyid: string;

  /** Nonce value from the signature */
  nonce: string;

  /** TTL in seconds (480 for TAP 8-min window) */
  ttlSeconds: number;
}

/**
 * Replay store interface for nonce deduplication.
 *
 * Keys are stored as SHA-256 hashes of `issuer|keyid|nonce` to prevent
 * correlation of raw identifiers in storage.
 *
 * Implementations:
 * - Durable Objects: Strong consistency, atomic check-and-set (enterprise)
 * - D1: Strong consistency, atomic via SQLite transactions
 * - KV: Eventual consistency, best-effort only (NOT atomic, may allow replays)
 */
export interface ReplayStore {
  /**
   * Check if nonce has been seen. If not, mark it as seen.
   *
   * @param ctx - Replay context with issuer, keyid, nonce, and TTL
   * @returns true if replay detected (nonce already seen), false if new
   */
  seen(ctx: ReplayContext): Promise<boolean>;
}

/**
 * Verification result from the worker.
 */
export interface VerificationResult {
  /** Whether verification succeeded */
  valid: boolean;

  /** Whether this was a TAP request */
  isTap: boolean;

  /** Control entry if TAP verification succeeded */
  controlEntry?: TapControlEntry;

  /** Error code if verification failed */
  errorCode?: string;

  /** Error message if verification failed */
  errorMessage?: string;
}

/**
 * RFC 9457 Problem Details response.
 *
 * Includes PEAC-specific `code` extension for stable error identification.
 */
export interface ProblemDetails {
  /** Problem type URI */
  type: string;

  /** Short human-readable summary */
  title: string;

  /** HTTP status code */
  status: number;

  /** Human-readable explanation (MUST NOT contain sensitive data) */
  detail?: string;

  /** URI reference for the specific occurrence */
  instance?: string;

  /** PEAC extension: stable error code (e.g., "E_TAP_SIGNATURE_INVALID") */
  code?: string;
}
