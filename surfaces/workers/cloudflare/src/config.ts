/**
 * @peac/worker-cloudflare - Configuration utilities
 *
 * Parse environment variables into typed configuration.
 */

import type { Env, WorkerConfig } from './types.js';

/**
 * Parse worker configuration from environment.
 */
export function parseConfig(env: Env): WorkerConfig {
  return {
    issuerAllowlist: parseCommaSeparated(env.ISSUER_ALLOWLIST),
    bypassPaths: parseCommaSeparated(env.BYPASS_PATHS),
    allowUnknownTags: parseBool(env.ALLOW_UNKNOWN_TAGS, false),
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
 * Returns true if allowlist is empty (open access).
 */
export function isIssuerAllowed(issuer: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true; // Open access if no allowlist configured
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
