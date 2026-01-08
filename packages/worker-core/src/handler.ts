/**
 * PEAC Worker Core - Handler Factories
 *
 * Production-grade error normalization and handler composition.
 *
 * - createHandler: Safe error normalization with RFC 9457 Problem Details
 * - createHandlerUnsafe: Passthrough for internal usage (UNSAFE)
 *
 * @packageDocumentation
 */

import { ErrorCodes, createProblemDetails, type ProblemDetails } from './errors.js';
import { requiresWwwAuthenticate, buildWwwAuthenticate } from '@peac/contracts';
import type { HandlerResult } from './types.js';

/**
 * Handler function type.
 *
 * Takes a platform-specific request and returns a HandlerResult.
 */
export type Handler<TRequest = unknown> = (request: TRequest) => Promise<HandlerResult>;

/**
 * Normalized error response.
 */
export interface ErrorResponse {
  status: number;
  headers: Record<string, string>;
  body: ProblemDetails;
}

/**
 * Create a safe handler with production-grade error normalization.
 *
 * Wraps a handler function with:
 * - Try/catch error handling
 * - Normalization of thrown errors to RFC 9457 Problem Details
 * - Canonical WWW-Authenticate header for 401/402
 * - Content-Type: application/problem+json
 * - Cache-Control: no-store
 *
 * Unknown errors are mapped to E_INTERNAL_ERROR with status 500.
 *
 * SECURITY: Error messages are NOT leaked to the client by default.
 * Use UNSAFE_DEV_MODE=true environment variable only in development
 * to include error messages in responses.
 *
 * @param handler - Handler function to wrap
 * @returns Wrapped handler with error normalization
 *
 * @example
 * ```typescript
 * const safeHandler = createHandler(async (request) => {
 *   return await handleVerification(request, config, options);
 * });
 * ```
 */
export function createHandler<TRequest>(
  handler: Handler<TRequest>
): (request: TRequest) => Promise<HandlerResult | ErrorResponse> {
  return async (request: TRequest): Promise<HandlerResult | ErrorResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      // Log error server-side for debugging (platform-specific logging)
      // Note: In production workers, use platform logging (console.error, logger, etc.)
      if (error instanceof Error) {
        // Generate trace ID for correlation
        const traceId = crypto.randomUUID?.() ?? `trace-${Date.now()}`;
        console.error(`[PEAC Worker Error] Trace ID: ${traceId}`, {
          message: error.message,
          stack: error.stack,
        });
      }

      // Normalize unknown errors to E_INTERNAL_ERROR
      const code = ErrorCodes.INTERNAL_ERROR;

      // SECURITY: Generic message by default (no leak)
      // Only include error details if UNSAFE_DEV_MODE=true (development only)
      const unsafeDevMode = globalThis.process?.env?.UNSAFE_DEV_MODE === 'true';
      const detail = unsafeDevMode && error instanceof Error
        ? `Internal error: ${error.message}`
        : 'An unexpected internal error occurred. Please contact support if the issue persists.';

      const problem = createProblemDetails(code, detail);

      const headers: Record<string, string> = {
        'Content-Type': 'application/problem+json',
        'X-PEAC-Error': code,
        'Cache-Control': 'no-store',
      };

      // Add WWW-Authenticate for 401/402
      if (requiresWwwAuthenticate(problem.status)) {
        headers['WWW-Authenticate'] = buildWwwAuthenticate(code);
      }

      return {
        status: problem.status,
        headers,
        body: problem,
      };
    }
  };
}

/**
 * Create an unsafe handler with no error normalization.
 *
 * WARNING: This handler does NOT catch or normalize errors.
 * Thrown errors will propagate to the caller.
 *
 * Only use this for:
 * - Internal tools where you control the error handling
 * - Testing/debugging scenarios
 * - Contexts where you have a custom error handling layer above
 *
 * NEVER use this in production edge workers or public APIs.
 *
 * @param handler - Handler function (passthrough, no wrapping)
 * @returns The handler function unchanged
 *
 * @example
 * ```typescript
 * // UNSAFE: For internal tools only
 * const unsafeHandler = createHandlerUnsafe(async (request) => {
 *   return await handleVerification(request, config, options);
 * });
 * ```
 */
export function createHandlerUnsafe<TRequest>(handler: Handler<TRequest>): Handler<TRequest> {
  return handler; // Passthrough - no wrapping
}
