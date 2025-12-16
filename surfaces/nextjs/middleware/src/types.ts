/**
 * @peac/middleware-nextjs - Type definitions
 *
 * Next.js Edge middleware for TAP verification and 402 access gate.
 * Maintains parity with Cloudflare Worker semantics.
 */

import type { TapControlEntry } from '@peac/mappings-tap';

/**
 * Verification mode for the middleware.
 *
 * - "receipt_or_tap": Missing TAP headers return 402 (receipt challenge)
 * - "tap_only": Missing TAP headers return 401 (signature missing)
 */
export type VerificationMode = 'receipt_or_tap' | 'tap_only';

/**
 * Middleware configuration.
 *
 * Security defaults (fail-closed):
 * - ISSUER_ALLOWLIST is REQUIRED (500 if empty unless unsafeAllowAnyIssuer=true)
 * - Unknown TAP tags are REJECTED (unless unsafeAllowUnknownTags=true)
 * - Replay protection is REQUIRED when nonce present (unless unsafeAllowNoReplay=true)
 */
export interface MiddlewareConfig {
  /** Verification mode (default: "receipt_or_tap") */
  mode?: VerificationMode;

  /** Allowed issuer origins (REQUIRED for production) */
  issuerAllowlist: string[];

  /** Bypass path patterns (glob-style) */
  bypassPaths?: string[];

  /** Optional replay store for nonce deduplication */
  replayStore?: ReplayStore;

  /** UNSAFE: Allow any issuer when allowlist is empty (default: false) */
  unsafeAllowAnyIssuer?: boolean;

  /** UNSAFE: Allow unknown TAP tags (default: false - fail-closed) */
  unsafeAllowUnknownTags?: boolean;

  /** UNSAFE: Allow requests without replay protection (default: false) */
  unsafeAllowNoReplay?: boolean;
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
 */
export interface ReplayStore {
  /**
   * Check if nonce has been seen. If not, mark it as seen.
   *
   * @param ctx - Replay context with issuer, keyid, nonce, and TTL
   * @returns true if replay detected (nonce already seen), false if new
   */
  seen(ctx: ReplayContext): Promise<boolean>;

  /**
   * Optional: Identify this store type for warning headers.
   * Returns "best-effort" for LRU-based stores.
   */
  readonly type?: 'strong' | 'best-effort';
}

/**
 * Verification result from the middleware.
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

/**
 * Handler request interface (runtime-neutral).
 */
export interface HandlerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/**
 * Handler response interface.
 */
export interface HandlerResponse {
  status: number;
  headers: Record<string, string>;
  body?: string;
}
