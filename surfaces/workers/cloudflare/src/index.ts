/**
 * @peac/worker-cloudflare
 *
 * PEAC receipt verification worker for Cloudflare Workers.
 *
 * Features:
 * - TAP (Trusted Agent Protocol) verification
 * - PEAC receipt verification
 * - Pluggable replay protection (DO/D1/KV)
 * - RFC 9457 problem+json error responses
 * - Configurable issuer allowlist
 * - Path-based bypass
 *
 * Uses shared worker core for runtime-neutral verification logic.
 *
 * @see https://peacprotocol.org
 */

import { createResolver } from '@peac/jwks-cache';
import type { Env, WorkerConfig } from './types.js';
import { parseConfig } from './config.js';
import { createReplayStore } from './replay-store.js';
import { createErrorResponse, createChallengeResponse, ErrorCodes } from './errors.js';
import { handleVerification, type HandlerResult, type RequestLike } from '../../_shared/core/index.js';

// Re-export types and utilities
export type {
  Env,
  WorkerConfig,
  ReplayStore,
  ReplayContext,
  VerificationResult,
  ProblemDetails,
} from './types.js';
export { parseConfig, matchesBypassPath, isIssuerAllowed } from './config.js';
export {
  createReplayStore,
  DurableObjectReplayStore,
  D1ReplayStore,
  KVReplayStore,
  NoOpReplayStore,
  ReplayDurableObject,
} from './replay-store.js';
export { ErrorCodes, createErrorResponse, createChallengeResponse } from './errors.js';

/**
 * Convert handler result to Cloudflare Response.
 */
function resultToResponse(result: HandlerResult): Response {
  switch (result.action) {
    case 'challenge':
      return createChallengeResponse(result.requestUrl ?? '');

    case 'error':
      return createErrorResponse(
        result.errorCode ?? ErrorCodes.INTERNAL_ERROR,
        result.errorDetail,
        result.requestUrl
      );

    default:
      // 'pass' and 'forward' are handled by the caller
      throw new Error(`Unexpected action: ${result.action}`);
  }
}

/**
 * Main worker handler.
 *
 * Security: Fail-closed by default.
 * - ISSUER_ALLOWLIST is required unless UNSAFE_ALLOW_ANY_ISSUER=true
 * - Unknown TAP tags are rejected unless UNSAFE_ALLOW_UNKNOWN_TAGS=true
 * - Replay protection is required unless UNSAFE_ALLOW_NO_REPLAY=true
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const config = parseConfig(env);

  // Create JWKS resolver with issuer allowlist (or allow all if UNSAFE mode)
  const keyResolver = createResolver({
    isAllowedHost: (host) => {
      if (config.unsafeAllowAnyIssuer) {
        return true; // UNSAFE: Open access
      }
      return config.issuerAllowlist.some((allowed) => {
        try {
          return new URL(allowed).host === host;
        } catch {
          return false;
        }
      });
    },
  });

  // Create replay store
  const replayStore = createReplayStore(env);

  // Convert Cloudflare Headers to Record for runtime neutrality
  const headersRecord: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headersRecord[key] = value;
  });

  // Wrap Cloudflare Request to RequestLike interface
  const requestLike: RequestLike = {
    method: request.method,
    url: request.url,
    headers: {
      get: (name: string) => headersRecord[name] ?? null,
      entries: function* (): IterableIterator<[string, string]> {
        for (const key of Object.keys(headersRecord)) {
          yield [key, headersRecord[key]];
        }
      },
    },
  };

  // Use shared verification handler
  const result = await handleVerification(requestLike, config, {
    keyResolver,
    replayStore,
    unsafeAllowUnknownTags: config.unsafeAllowUnknownTags,
    unsafeAllowNoReplay: config.unsafeAllowNoReplay,
  });

  // Handle bypass (pass through to origin)
  if (result.action === 'pass') {
    return fetch(request);
  }

  // Handle challenge or error
  if (result.action === 'challenge' || result.action === 'error') {
    // Log config error for debugging
    if (result.errorCode === ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED) {
      console.error(
        '[PEAC] FATAL: ISSUER_ALLOWLIST is required. ' +
          'Set ISSUER_ALLOWLIST to a comma-separated list of allowed issuer origins, ' +
          'or set UNSAFE_ALLOW_ANY_ISSUER=true for development (NOT recommended for production).'
      );
    }
    return resultToResponse(result);
  }

  // Handle forward (verification succeeded)
  if (result.action === 'forward') {
    // Forward request to origin with verification metadata
    const response = await fetch(request);

    // Add verification headers to response
    const headers = new Headers(response.headers);
    headers.set('X-PEAC-Verified', 'true');
    headers.set('X-PEAC-Engine', 'tap');

    if (result.controlEntry?.evidence.tag) {
      headers.set('X-PEAC-TAP-Tag', result.controlEntry.evidence.tag);
    }

    // Warn in response header if replay protection is not configured (UNSAFE mode only)
    if (result.warning) {
      headers.set('X-PEAC-Warning', result.warning);
      console.warn(
        '[PEAC] WARNING: No replay store configured with UNSAFE_ALLOW_NO_REPLAY=true. ' +
          'Replay attacks are possible. This is UNSAFE for production.'
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // Should never reach here
  return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Unknown handler result');
}

/**
 * Worker entry point.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  },
};
