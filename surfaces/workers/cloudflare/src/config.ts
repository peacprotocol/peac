/**
 * @peac/worker-cloudflare - Configuration utilities
 *
 * Parse environment variables into typed configuration.
 *
 * Security defaults (fail-closed):
 * - ISSUER_ALLOWLIST is REQUIRED (unless UNSAFE_ALLOW_ANY_ISSUER=true)
 * - Unknown TAP tags are REJECTED (unless UNSAFE_ALLOW_UNKNOWN_TAGS=true)
 * - Replay protection is REQUIRED when nonce present (unless UNSAFE_ALLOW_NO_REPLAY=true)
 */

import type { Env, WorkerConfig } from './types.js';

/**
 * Parse worker configuration from environment.
 *
 * Security: All unsafe flags default to false (fail-closed).
 */
export function parseConfig(env: Env): WorkerConfig {
  return {
    issuerAllowlist: parseCommaSeparated(env.ISSUER_ALLOWLIST),
    bypassPaths: parseCommaSeparated(env.BYPASS_PATHS),
    unsafeAllowAnyIssuer: parseBool(env.UNSAFE_ALLOW_ANY_ISSUER, false),
    unsafeAllowUnknownTags: parseBool(env.UNSAFE_ALLOW_UNKNOWN_TAGS, false),
    unsafeAllowNoReplay: parseBool(env.UNSAFE_ALLOW_NO_REPLAY, false),
  };
}

/**
 * Parse comma-separated string into array.
 */
function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse boolean from string.
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Check if path matches any bypass pattern.
 *
 * Supports simple glob patterns:
 * - * matches any segment
 * - ** matches any path (not implemented for simplicity)
 */
export function matchesBypassPath(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchGlob(path, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob matching.
 */
function matchGlob(path: string, pattern: string): boolean {
  // Exact match
  if (pattern === path) {
    return true;
  }

  // Convert glob to regex
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
        .replace(/\*/g, '[^/]*') // * matches any segment
        .replace(/\?/g, '.') + // ? matches single char
      '$'
  );

  return regex.test(path);
}

/**
 * Check if issuer is in allowlist.
 *
 * NOTE: This function does NOT handle the empty allowlist case.
 * The handler must check for empty allowlist separately and either:
 * - Return 500 config error (fail-closed, default)
 * - Allow any issuer (UNSAFE_ALLOW_ANY_ISSUER=true)
 */
export function isIssuerAllowed(issuer: string, allowlist: string[]): boolean {
  // Empty allowlist should be handled by caller before reaching here
  if (allowlist.length === 0) {
    return false;
  }

  // Normalize issuer to origin
  try {
    const issuerOrigin = new URL(issuer).origin;
    return allowlist.some((allowed) => {
      const allowedOrigin = new URL(allowed).origin;
      return issuerOrigin === allowedOrigin;
    });
  } catch {
    return false;
  }
}
