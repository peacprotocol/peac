/**
 * @peac/worker-fastly
 *
 * PEAC receipt verification worker for Fastly Compute.
 *
 * Features:
 * - TAP (Trusted Agent Protocol) verification
 * - PEAC receipt verification
 * - Pluggable replay protection (KV Store)
 * - RFC 9457 problem+json error responses
 * - Configurable issuer allowlist
 * - Path-based bypass
 *
 * Uses shared worker core for runtime-neutral verification logic.
 *
 * @see https://www.peacprotocol.org
 */

import { createResolver } from '@peac/jwks-cache';
import type { WorkerConfig, FastlyBackendConfig } from './types.js';
import { parseConfig } from './config.js';
import { createReplayStore } from './replay-store.js';
import { createErrorResponse, createChallengeResponse, ErrorCodes } from './errors.js';
import {
  handleVerification,
  type HandlerResult,
  type RequestLike,
} from '../../_shared/core/index.js';

// Re-export types and utilities
export type {
  FastlyEnv,
  FastlyBackendConfig,
  WorkerConfig,
  ReplayStore,
  ReplayContext,
  VerificationResult,
  ProblemDetails,
} from './types.js';
export { parseConfig, matchesBypassPath, isIssuerAllowed } from './config.js';
export {
  createReplayStore,
  KVStoreReplayStore,
  InMemoryReplayStore,
  NoOpReplayStore,
} from './replay-store.js';
export { ErrorCodes, createErrorResponse, createChallengeResponse } from './errors.js';

/**
 * Convert handler result to Fastly Response.
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
 * Create request handler for Fastly Compute.
 *
 * @param backendConfig - Backend configuration
 * @returns Request handler function
 */
export function createHandler(backendConfig: FastlyBackendConfig) {
  const { originBackend, configDictName, replayKvStore } = backendConfig;

  return async function handleRequest(request: Request): Promise<Response> {
    const config = parseConfig(configDictName);

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
    const replayStore = createReplayStore(replayKvStore);

    // Convert Headers to Record for runtime neutrality
    const headersRecord: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headersRecord[key] = value;
    });

    // Wrap Request to RequestLike interface
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
      return fetchOrigin(request, originBackend);
    }

    // Handle challenge or error
    if (result.action === 'challenge' || result.action === 'error') {
      // Log config error for debugging
      if (result.errorCode === ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED) {
        console.error(
          '[PEAC] FATAL: ISSUER_ALLOWLIST is required. ' +
            'Set issuer_allowlist in Edge Dictionary, ' +
            'or set unsafe_allow_any_issuer=true for development (NOT recommended for production).'
        );
      }
      return resultToResponse(result);
    }

    // Handle forward (verification succeeded)
    if (result.action === 'forward') {
      // Forward request to origin with verification metadata
      const response = await fetchOrigin(request, originBackend);

      // Add verification headers to response
      const headers = new Headers(response.headers);
      headers.set('PEAC-Verified', 'true');
      headers.set('PEAC-Engine', 'tap');

      if (result.controlEntry?.evidence.tag) {
        headers.set('PEAC-TAP-Tag', result.controlEntry.evidence.tag);
      }

      // Warn in response header if replay protection is not configured (UNSAFE mode only)
      if (result.warning) {
        headers.set('PEAC-Warning', result.warning);
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
  };
}

/**
 * Fetch from origin backend.
 *
 * In Fastly Compute, use the Backend API.
 */
async function fetchOrigin(request: Request, backend: string): Promise<Response> {
  // In Fastly Compute, use:
  // return fetch(request, { backend });

  // For testing, simulate with standard fetch
  // The backend parameter would be used in real Fastly Compute
  if (typeof globalThis !== 'undefined' && 'fetch' in globalThis) {
    // Check if Fastly's fetch with backend is available
    const fastlyFetch = globalThis.fetch as (
      input: Request | string,
      init?: RequestInit & { backend?: string }
    ) => Promise<Response>;
    return fastlyFetch(request, { backend });
  }
  return fetch(request);
}

/**
 * Default handler for simple deployments.
 *
 * Uses default configuration:
 * - Backend: "origin"
 * - Config dictionary: "peac_config"
 * - KV Store: "peac_replay"
 */
export const defaultHandler = createHandler({
  originBackend: 'origin',
  configDictName: 'peac_config',
  replayKvStore: 'peac_replay',
});

/**
 * Worker entry point for Fastly Compute.
 *
 * Usage in fastly.toml:
 * ```toml
 * [scripts]
 * build = "pnpm run build"
 *
 * [local_server]
 * [local_server.backends]
 * [local_server.backends.origin]
 * url = "https://your-origin.example.com"
 * ```
 */
// FetchEvent type for Fastly Compute (Service Worker-like API)
interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

addEventListener('fetch', ((event: FetchEvent) => {
  event.respondWith(
    defaultHandler(event.request).catch((error) => {
      console.error('Worker error:', error);
      return createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      );
    })
  );
}) as EventListener);
