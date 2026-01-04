/**
 * @peac/worker-akamai
 *
 * PEAC receipt verification worker for Akamai EdgeWorkers.
 *
 * Features:
 * - TAP (Trusted Agent Protocol) verification
 * - PEAC receipt verification
 * - Pluggable replay protection (EdgeKV)
 * - RFC 9457 problem+json error responses
 * - Configurable issuer allowlist
 * - Path-based bypass
 *
 * Uses shared worker core for runtime-neutral verification logic.
 *
 * @see https://peacprotocol.org
 */

import { createResolver } from '@peac/jwks-cache';
import type {
  WorkerConfig,
  EWRequest,
  EWResponse,
  EWRequestHandler,
  EdgeKVConfig,
} from './types.js';
import { parseConfig } from './config.js';
import { createReplayStore } from './replay-store.js';
import {
  respondWithError,
  respondWithChallenge,
  ErrorCodes,
  createErrorResponse,
} from './errors.js';
import {
  handleVerification,
  type HandlerResult,
  type RequestLike,
} from '../../_shared/core/index.js';

// Re-export types and utilities
export type {
  AkamaiEnv,
  EdgeKVConfig,
  WorkerConfig,
  ReplayStore,
  ReplayContext,
  VerificationResult,
  ProblemDetails,
  EWRequest,
  EWResponse,
  EWRequestHandler,
} from './types.js';
export {
  parseConfig,
  parseConfigFromRecord,
  matchesBypassPath,
  isIssuerAllowed,
} from './config.js';
export {
  createReplayStore,
  EdgeKVReplayStore,
  InMemoryReplayStore,
  NoOpReplayStore,
} from './replay-store.js';
export {
  ErrorCodes,
  respondWithError,
  respondWithChallenge,
  createErrorResponse,
} from './errors.js';

/**
 * Configuration for the PEAC verifier.
 */
export interface PeacVerifierConfig {
  /** EdgeKV configuration for replay protection */
  edgeKV?: EdgeKVConfig;
}

/**
 * Create onClientRequest handler for Akamai EdgeWorkers.
 *
 * @param config - Verifier configuration
 * @returns onClientRequest handler function
 */
export function createOnClientRequest(config?: PeacVerifierConfig) {
  const edgeKVConfig = config?.edgeKV;

  return async function onClientRequest(
    request: EWRequest,
    handler: EWRequestHandler
  ): Promise<void> {
    const workerConfig = parseConfig(request);

    // Create JWKS resolver with issuer allowlist (or allow all if UNSAFE mode)
    const keyResolver = createResolver({
      isAllowedHost: (host) => {
        if (workerConfig.unsafeAllowAnyIssuer) {
          return true; // UNSAFE: Open access
        }
        return workerConfig.issuerAllowlist.some((allowed) => {
          try {
            return new URL(allowed).host === host;
          } catch {
            return false;
          }
        });
      },
    });

    // Create replay store
    const replayStore = createReplayStore(edgeKVConfig);

    // Build request URL
    const requestUrl = `${request.scheme}://${request.host}${request.path}${request.query ? '?' + request.query : ''}`;

    // Convert Akamai headers to Record
    const headersRecord: Record<string, string> = {};
    const rawHeaders = request.getHeaders();
    for (const [key, values] of Object.entries(rawHeaders)) {
      // Akamai returns arrays, take the first value
      if (values && values.length > 0) {
        headersRecord[key] = values[0];
      }
    }

    // Wrap Akamai Request to RequestLike interface
    const requestLike: RequestLike = {
      method: request.method,
      url: requestUrl,
      headers: {
        get: (name: string) => headersRecord[name.toLowerCase()] ?? null,
        entries: function* (): IterableIterator<[string, string]> {
          for (const key of Object.keys(headersRecord)) {
            yield [key, headersRecord[key]];
          }
        },
      },
    };

    // Use shared verification handler
    const result = await handleVerification(requestLike, workerConfig, {
      keyResolver,
      replayStore,
      unsafeAllowUnknownTags: workerConfig.unsafeAllowUnknownTags,
      unsafeAllowNoReplay: workerConfig.unsafeAllowNoReplay,
    });

    // Handle bypass (pass through to origin - do nothing, let request continue)
    if (result.action === 'pass') {
      return;
    }

    // Handle challenge
    if (result.action === 'challenge') {
      respondWithChallenge(handler, requestUrl);
      return;
    }

    // Handle error
    if (result.action === 'error') {
      // Log config error for debugging
      if (result.errorCode === ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED) {
        // In Akamai, use logger.log() if available
        console.error(
          '[PEAC] FATAL: ISSUER_ALLOWLIST is required. ' +
            'Set PMUSER_ISSUER_ALLOWLIST in Property Manager, ' +
            'or set PMUSER_UNSAFE_ALLOW_ANY_ISSUER=true for development (NOT recommended for production).'
        );
      }
      respondWithError(
        handler,
        result.errorCode ?? ErrorCodes.INTERNAL_ERROR,
        result.errorDetail,
        requestUrl
      );
      return;
    }

    // Handle forward (verification succeeded - let request continue)
    // Set verification headers via Property Manager or origin response modification
    // Note: EdgeWorkers can't easily modify request headers for origin,
    // so verification metadata should be handled in onClientResponse or at origin
    return;
  };
}

/**
 * Create onClientResponse handler to add verification headers.
 *
 * @returns onClientResponse handler function
 */
export function createOnClientResponse() {
  return function onClientResponse(request: EWRequest, response: EWResponse): void {
    // Check if verification was successful (could use a shared state mechanism)
    // For now, just add a header indicating PEAC is active
    response.setHeader('PEAC-Engine', 'tap');
  };
}

/**
 * Default handlers for simple deployments.
 *
 * Usage in main.js:
 * ```javascript
 * import { onClientRequest, onClientResponse } from './index.js';
 * export { onClientRequest, onClientResponse };
 * ```
 */
export const onClientRequest = createOnClientRequest({
  edgeKV: {
    namespace: 'peac',
    group: 'replay',
  },
});

export const onClientResponse = createOnClientResponse();

/**
 * Handler that returns Response objects for testing.
 *
 * This bypasses the Akamai-specific handler.respondWith() API
 * and returns standard Response objects that can be tested.
 */
export async function handleRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  config: WorkerConfig,
  edgeKVConfig?: EdgeKVConfig
): Promise<Response> {
  const keyResolver = createResolver({
    isAllowedHost: (host) => {
      if (config.unsafeAllowAnyIssuer) {
        return true;
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

  const replayStore = createReplayStore(edgeKVConfig);

  const requestLike: RequestLike = {
    method,
    url,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      entries: function* (): IterableIterator<[string, string]> {
        for (const key of Object.keys(headers)) {
          yield [key, headers[key]];
        }
      },
    },
  };

  const result = await handleVerification(requestLike, config, {
    keyResolver,
    replayStore,
    unsafeAllowUnknownTags: config.unsafeAllowUnknownTags,
    unsafeAllowNoReplay: config.unsafeAllowNoReplay,
  });

  return resultToResponse(result, url);
}

/**
 * Convert handler result to Response.
 */
function resultToResponse(result: HandlerResult, requestUrl: string): Response {
  switch (result.action) {
    case 'pass':
    case 'forward':
      // Return a 200 response to indicate success
      // In real EdgeWorkers, these would continue to origin
      return new Response('OK', {
        status: 200,
        headers: {
          'PEAC-Verified': 'true',
          'PEAC-Engine': 'tap',
          ...(result.controlEntry?.evidence.tag
            ? { 'PEAC-TAP-Tag': result.controlEntry.evidence.tag }
            : {}),
          ...(result.warning ? { 'PEAC-Warning': result.warning } : {}),
        },
      });

    case 'challenge':
      return createErrorResponse(
        ErrorCodes.RECEIPT_MISSING,
        'A valid PEAC receipt is required to access this resource.',
        requestUrl
      );

    case 'error':
      return createErrorResponse(
        result.errorCode ?? ErrorCodes.INTERNAL_ERROR,
        result.errorDetail,
        requestUrl
      );

    default:
      return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Unknown handler result');
  }
}
