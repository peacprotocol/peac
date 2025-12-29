/**
 * @peac/worker-fastly - Configuration
 *
 * Fastly-specific config parsing.
 * Uses Edge Dictionary for static configuration.
 *
 * @packageDocumentation
 */

import type { WorkerConfig } from './types.js';
import { parseConfigFromEnv } from '../../_shared/core/index.js';

/**
 * Parse config from Fastly Edge Dictionary.
 *
 * Edge Dictionary provides static configuration.
 * Falls back to environment variables if dictionary not available.
 *
 * @param dictName - Edge Dictionary name (default: "peac_config")
 * @returns Worker configuration
 */
export function parseConfig(dictName?: string): WorkerConfig {
  // Build env record from Edge Dictionary or fallback
  const env: Record<string, string | undefined> = {};

  try {
    // Try to read from Edge Dictionary
    // Note: This uses Fastly's Dictionary API
    // In actual Fastly Compute, use: new Dictionary(dictName)
    const dict = getDictionary(dictName ?? 'peac_config');

    if (dict) {
      env.ISSUER_ALLOWLIST = dict.get('issuer_allowlist') ?? undefined;
      env.BYPASS_PATHS = dict.get('bypass_paths') ?? undefined;
      env.UNSAFE_ALLOW_ANY_ISSUER = dict.get('unsafe_allow_any_issuer') ?? undefined;
      env.UNSAFE_ALLOW_UNKNOWN_TAGS = dict.get('unsafe_allow_unknown_tags') ?? undefined;
      env.UNSAFE_ALLOW_NO_REPLAY = dict.get('unsafe_allow_no_replay') ?? undefined;
    }
  } catch {
    // Dictionary not available, fall through to env vars
  }

  // Fallback to environment variables for any missing values
  if (typeof globalThis !== 'undefined' && 'fastly' in globalThis) {
    const fastly = (globalThis as unknown as { fastly: { getEnv: (k: string) => string | undefined } }).fastly;
    env.ISSUER_ALLOWLIST ??= fastly.getEnv('ISSUER_ALLOWLIST');
    env.BYPASS_PATHS ??= fastly.getEnv('BYPASS_PATHS');
    env.UNSAFE_ALLOW_ANY_ISSUER ??= fastly.getEnv('UNSAFE_ALLOW_ANY_ISSUER');
    env.UNSAFE_ALLOW_UNKNOWN_TAGS ??= fastly.getEnv('UNSAFE_ALLOW_UNKNOWN_TAGS');
    env.UNSAFE_ALLOW_NO_REPLAY ??= fastly.getEnv('UNSAFE_ALLOW_NO_REPLAY');
  }

  return parseConfigFromEnv(env);
}

/**
 * Get Edge Dictionary.
 *
 * Abstracted for testing - in real Fastly Compute, uses native Dictionary.
 */
function getDictionary(name: string): Map<string, string> | null {
  // In Fastly Compute runtime, use:
  // return new Dictionary(name);

  // For now, return null to fall through to env vars
  // This allows testing without Fastly runtime
  try {
    if (typeof globalThis !== 'undefined' && 'Dictionary' in globalThis) {
      const DictClass = (globalThis as unknown as { Dictionary: new (name: string) => Map<string, string> }).Dictionary;
      return new DictClass(name);
    }
  } catch {
    // Dictionary not available
  }
  return null;
}

// Re-export config utilities from shared core
export { matchesBypassPath, isIssuerAllowed } from '../../_shared/core/index.js';
