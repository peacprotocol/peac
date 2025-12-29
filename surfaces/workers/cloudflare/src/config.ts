/**
 * @peac/worker-cloudflare - Configuration utilities
 *
 * Cloudflare-specific configuration parsing.
 * Uses shared core for most config logic.
 *
 * @packageDocumentation
 */

import type { Env } from './types.js';
import type { WorkerConfig } from '../../_shared/core/index.js';
import {
  parseConfigFromEnv,
  matchesBypassPath,
  isIssuerAllowed,
} from '../../_shared/core/index.js';

// Re-export shared utilities
export { matchesBypassPath, isIssuerAllowed };

/**
 * Parse worker configuration from Cloudflare environment.
 *
 * Security: All unsafe flags default to false (fail-closed).
 */
export function parseConfig(env: Env): WorkerConfig {
  return parseConfigFromEnv({
    ISSUER_ALLOWLIST: env.ISSUER_ALLOWLIST,
    BYPASS_PATHS: env.BYPASS_PATHS,
    UNSAFE_ALLOW_ANY_ISSUER: env.UNSAFE_ALLOW_ANY_ISSUER,
    UNSAFE_ALLOW_UNKNOWN_TAGS: env.UNSAFE_ALLOW_UNKNOWN_TAGS,
    UNSAFE_ALLOW_NO_REPLAY: env.UNSAFE_ALLOW_NO_REPLAY,
  });
}
