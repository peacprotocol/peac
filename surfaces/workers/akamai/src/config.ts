/**
 * @peac/worker-akamai - Configuration
 *
 * Akamai-specific config parsing.
 * Uses Property Manager variables for configuration.
 *
 * @packageDocumentation
 */

import type { WorkerConfig, EWRequest } from './types.js';
import { parseConfigFromEnv } from '../../_shared/core/index.js';

/**
 * Parse config from Akamai Property Manager variables.
 *
 * Variables are prefixed with PMUSER_ and accessed via request.getVariable().
 *
 * @param request - Akamai EdgeWorkers request
 * @returns Worker configuration
 */
export function parseConfig(request: EWRequest): WorkerConfig {
  // Build env record from Property Manager variables
  const env: Record<string, string | undefined> = {
    ISSUER_ALLOWLIST: request.getVariable('PMUSER_ISSUER_ALLOWLIST'),
    BYPASS_PATHS: request.getVariable('PMUSER_BYPASS_PATHS'),
    UNSAFE_ALLOW_ANY_ISSUER: request.getVariable('PMUSER_UNSAFE_ALLOW_ANY_ISSUER'),
    UNSAFE_ALLOW_UNKNOWN_TAGS: request.getVariable('PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS'),
    UNSAFE_ALLOW_NO_REPLAY: request.getVariable('PMUSER_UNSAFE_ALLOW_NO_REPLAY'),
  };

  return parseConfigFromEnv(env);
}

/**
 * Parse config from environment record.
 *
 * Used for testing when EWRequest is not available.
 *
 * @param env - Environment record
 * @returns Worker configuration
 */
export function parseConfigFromRecord(env: Record<string, string | undefined>): WorkerConfig {
  return parseConfigFromEnv(env);
}

// Re-export config utilities from shared core
export { matchesBypassPath, isIssuerAllowed } from '../../_shared/core/index.js';
