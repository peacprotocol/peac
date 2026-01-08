/**
 * PEAC Worker Core - Configuration Utilities
 *
 * Runtime-neutral configuration parsing for edge workers.
 *
 * @packageDocumentation
 */

import type { SafeWorkerConfig, InternalWorkerConfig, UnsafeWorkerConfig } from './types.js';

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
 * Only recognizes "true" and "1" (case-insensitive for "true").
 * "yes", "false", "0" etc are NOT recognized as true.
 */
export function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1';
}

/**
 * Parse safe worker configuration from environment variables.
 *
 * This parser ONLY reads safe configuration options.
 * Unsafe flags are NOT parsed from environment.
 *
 * @param env - Environment variables as a Record
 * @returns Safe configuration
 */
export function parseSafeConfigFromEnv(env: Record<string, string | undefined>): SafeWorkerConfig {
  return {
    issuerAllowlist: parseCommaSeparated(env.ISSUER_ALLOWLIST),
    bypassPaths: parseCommaSeparated(env.BYPASS_PATHS),
  };
}

/**
 * Parse full worker configuration from environment variables.
 *
 * INTERNAL: Used by the unsafe API only.
 *
 * Security: All unsafe flags default to false (fail-closed).
 *
 * @param env - Environment variables as a Record
 * @returns Full configuration with unsafe flags
 */
export function parseConfigFromEnv(env: Record<string, string | undefined>): InternalWorkerConfig {
  return {
    issuerAllowlist: parseCommaSeparated(env.ISSUER_ALLOWLIST),
    bypassPaths: parseCommaSeparated(env.BYPASS_PATHS),
    unsafeAllowAnyIssuer: parseBool(env.UNSAFE_ALLOW_ANY_ISSUER, false),
    unsafeAllowUnknownTags: parseBool(env.UNSAFE_ALLOW_UNKNOWN_TAGS, false),
    unsafeAllowNoReplay: parseBool(env.UNSAFE_ALLOW_NO_REPLAY, false),
  };
}

/**
 * Parse unsafe worker configuration from environment variables.
 *
 * WARNING: This function parses UNSAFE_ flags from environment.
 * Only use for local development and testing.
 *
 * @param env - Environment variables as a Record
 * @returns Unsafe configuration
 */
export function parseUnsafeConfigFromEnv(
  env: Record<string, string | undefined>
): UnsafeWorkerConfig {
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
 * - * at end matches any remaining path (e.g., /static/* matches /static/a/b)
 * - ? matches any single character
 *
 * Query strings are stripped before matching.
 *
 * @param path - URL pathname to check (may include query string)
 * @param patterns - List of glob patterns
 * @returns true if path matches any pattern
 */
export function matchesBypassPath(path: string, patterns: string[]): boolean {
  // Strip query string if present
  const pathOnly = path.split('?')[0];

  for (const pattern of patterns) {
    if (matchGlob(pathOnly, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob matching.
 *
 * Converts glob pattern to regex and tests against path.
 * - * at end matches any remaining path (greedy)
 * - ? matches any single character
 */
function matchGlob(path: string, pattern: string): boolean {
  // Exact match
  if (pattern === path) {
    return true;
  }

  // Check if pattern ends with * (matches any remaining path)
  const endsWithStar = pattern.endsWith('*');
  const basePattern = endsWithStar ? pattern.slice(0, -1) : pattern;

  // Escape special regex chars (not * which we handle separately)
  let regexStr = basePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Replace ? with single char matcher
  regexStr = regexStr.replace(/\?/g, '.');

  // Replace any remaining * with single-segment matcher
  regexStr = regexStr.replace(/\*/g, '[^/]*');

  // Add trailing .* if pattern ended with *
  if (endsWithStar) {
    regexStr += '.*';
  }

  const regex = new RegExp('^' + regexStr + '$');
  return regex.test(path);
}

/**
 * Check if issuer is in allowlist.
 *
 * For URL-based keyids: compares origins (scheme + host + port) for security.
 * For non-URL keyids: does direct string comparison.
 *
 * NOTE: This function returns false for empty allowlist.
 * The caller must check for empty allowlist separately and either:
 * - Return 500 config error (fail-closed, default)
 * - Allow any issuer (UNSAFE_ALLOW_ANY_ISSUER=true)
 *
 * @param issuer - Issuer origin, JWKS URI, or opaque key identifier
 * @param allowlist - List of allowed issuer origins or identifiers
 * @returns true if issuer is in allowlist
 */
export function isIssuerAllowed(issuer: string, allowlist: string[]): boolean {
  // Empty allowlist should be handled by caller before reaching here
  if (allowlist.length === 0) {
    return false;
  }

  // Try URL-based origin comparison first
  try {
    const issuerOrigin = new URL(issuer).origin;
    const urlMatch = allowlist.some((allowed) => {
      try {
        const allowedOrigin = new URL(allowed).origin;
        return issuerOrigin === allowedOrigin;
      } catch {
        return false;
      }
    });
    if (urlMatch) {
      return true;
    }
  } catch {
    // Not a valid URL - fall through to direct comparison
  }

  // Fall back to direct string comparison for non-URL keyids
  return allowlist.includes(issuer);
}

/**
 * Convert safe config to internal config with safe defaults.
 *
 * All unsafe flags are set to false (fail-closed).
 */
export function toInternalConfig(config: SafeWorkerConfig): InternalWorkerConfig {
  return {
    ...config,
    unsafeAllowAnyIssuer: false,
    unsafeAllowUnknownTags: false,
    unsafeAllowNoReplay: false,
  };
}

/**
 * Convert unsafe config to internal config.
 */
export function unsafeToInternalConfig(config: UnsafeWorkerConfig): InternalWorkerConfig {
  return config;
}
