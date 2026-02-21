/**
 * PEAC Shared Worker Core - Configuration Utilities
 *
 * Runtime-neutral configuration parsing for edge workers.
 *
 * @packageDocumentation
 */

import type { WorkerConfig } from './types.js';

/**
 * Parse comma-separated string into array.
 *
 * Trims whitespace and filters empty values.
 */
export function parseCommaSeparated(value: string | undefined): string[] {
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
 *
 * Recognizes "true", "1", "yes" (case-insensitive).
 */
export function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Parse worker configuration from environment variables.
 *
 * Security: All unsafe flags default to false (fail-closed).
 *
 * @param env - Environment variables as a Record
 * @returns Parsed configuration
 */
export function parseConfigFromEnv(env: Record<string, string | undefined>): WorkerConfig {
  return {
    issuerAllowlist: parseCommaSeparated(env.ISSUER_ALLOWLIST),
    bypassPaths: parseCommaSeparated(env.BYPASS_PATHS),
    unsafeAllowAnyIssuer: parseBool(env.UNSAFE_ALLOW_ANY_ISSUER, false),
    unsafeAllowUnknownTags: parseBool(env.UNSAFE_ALLOW_UNKNOWN_TAGS, false),
    unsafeAllowNoReplay: parseBool(env.UNSAFE_ALLOW_NO_REPLAY, false),
  };
}

/**
 * Check if path matches any bypass pattern.
 *
 * Supports simple glob patterns:
 * - * matches any single path segment
 * - ? matches any single character
 *
 * @param path - URL pathname to check
 * @param patterns - List of glob patterns
 * @returns true if path matches any pattern
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
 *
 * Converts glob pattern to regex and tests against path.
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
 * Compares origins (scheme + host + port) for security.
 *
 * NOTE: This function returns false for empty allowlist.
 * The caller must check for empty allowlist separately and either:
 * - Return 500 config error (fail-closed, default)
 * - Allow any issuer (UNSAFE_ALLOW_ANY_ISSUER=true)
 *
 * @param issuer - Issuer origin or JWKS URI
 * @param allowlist - List of allowed issuer origins
 * @returns true if issuer is in allowlist
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
      try {
        const allowedOrigin = new URL(allowed).origin;
        return issuerOrigin === allowedOrigin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
