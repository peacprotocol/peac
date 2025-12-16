/**
 * @peac/worker-cloudflare - Type definitions
 *
 * Cloudflare Worker for PEAC receipt verification.
 */

import type { TapControlEntry } from '@peac/mappings-tap';

/**
 * Worker environment bindings.
 */
export interface Env {
  /** Comma-separated list of allowed issuers */
  ISSUER_ALLOWLIST?: string;

  /** Comma-separated list of bypass paths (glob patterns) */
  BYPASS_PATHS?: string;

  /** Allow unknown TAP tags (default: false - fail-closed) */
  ALLOW_UNKNOWN_TAGS?: string;

  /** KV namespace for best-effort replay protection */
  REPLAY_KV?: KVNamespace;

  /** Durable Object for strong replay protection */
  REPLAY_DO?: DurableObjectNamespace;

  /** D1 database for replay protection */
  REPLAY_D1?: D1Database;
}

/**
 * Worker configuration derived from environment.
 */
export interface WorkerConfig {
  /** Allowed issuer origins */
  issuerAllowlist: string[];

  /** Bypass path patterns */
  bypassPaths: string[];

  /** Allow unknown TAP tags */
  allowUnknownTags: boolean;
}

/**
 * Replay store interface for nonce deduplication.
 *
 * Implementations:
 * - Durable Objects: Strong consistency (recommended for enterprise)
 * - D1: Strong consistency (slightly higher latency)
 * - KV: Eventual consistency (best-effort only, NOT atomic)
 */
export interface ReplayStore {
  /**
   * Check if nonce has been seen. If not, mark it as seen.
   *
   * @param nonce - The nonce to check
   * @param ttlSeconds - TTL for the nonce entry (480 for TAP 8-min window)
   * @returns true if replay detected (nonce already seen), false if new
   */
  seen(nonce: string, ttlSeconds: number): Promise<boolean>;
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
 */
export interface ProblemDetails {
  /** Problem type URI */
  type: string;

  /** Short human-readable summary */
  title: string;

  /** HTTP status code */
  status: number;

  /** Human-readable explanation */
  detail?: string;

  /** URI reference for the specific occurrence */
  instance?: string;
}
