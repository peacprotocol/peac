/**
 * @peac/middleware-nextjs
 *
 * PEAC TAP verifier and 402 access gate for Next.js Edge Runtime.
 *
 * Features:
 * - TAP (Trusted Agent Protocol) verification
 * - 402 Payment Required challenge for unauthenticated requests
 * - Pluggable replay protection
 * - RFC 9457 problem+json error responses
 * - Configurable issuer allowlist
 * - Path-based bypass
 *
 * Parity with Cloudflare Worker:
 * - Same error codes and status mappings
 * - Same fail-closed security defaults
 * - Same replay protection semantics
 *
 * @see https://peacprotocol.org
 */

import { handleRequest } from './handler.js';
import type { MiddlewareConfig, HandlerRequest } from './types.js';

// Re-export types and utilities
export type {
  MiddlewareConfig,
  VerificationMode,
  ReplayStore,
  ReplayContext,
  VerificationResult,
  ProblemDetails,
  HandlerRequest,
  HandlerResponse,
} from './types.js';
export { handleRequest, getVerificationHeaders } from './handler.js';
export { LRUReplayStore, type LRUReplayStoreOptions } from './replay-store.js';
export { ErrorCodes, createProblemDetails, getErrorStatus } from './errors.js';

/**
 * Minimal Next.js types for middleware compatibility.
 * These match Next.js 13/14/15 Edge Runtime signatures.
 */
interface NextRequestLike {
  method: string;
  url: string;
  headers: Headers;
}

interface NextResponseLike {
  headers: Headers;
}

type NextMiddlewareLike = (
  request: NextRequestLike
) => Promise<Response | NextResponseLike | undefined>;

/**
 * Convert Headers to Record.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Create PEAC middleware for Next.js.
 *
 * Security defaults (fail-closed):
 * - issuerAllowlist is REQUIRED (500 error if empty unless unsafeAllowAnyIssuer=true)
 * - Unknown TAP tags are REJECTED (unless unsafeAllowUnknownTags=true)
 * - Replay protection is REQUIRED when nonce present (unless unsafeAllowNoReplay=true)
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { createPeacMiddleware, LRUReplayStore } from '@peac/middleware-nextjs';
 *
 * export const middleware = createPeacMiddleware({
 *   issuerAllowlist: ['https://trusted-agent.example.com'],
 *   bypassPaths: ['/api/health', '/public/**'],
 *   replayStore: new LRUReplayStore(), // Best-effort, per-isolate
 * });
 *
 * export const config = {
 *   matcher: '/api/:path*',
 * };
 * ```
 */
export function createPeacMiddleware(config: MiddlewareConfig): NextMiddlewareLike {
  return async function peacMiddleware(request: NextRequestLike): Promise<Response> {
    // Convert to handler request format
    const handlerRequest: HandlerRequest = {
      method: request.method,
      url: request.url,
      headers: headersToRecord(request.headers),
    };

    try {
      // Handle verification
      const result = await handleRequest(handlerRequest, config);

      if (result !== null) {
        // Return error response
        return new Response(result.body, {
          status: result.status,
          headers: result.headers,
        });
      }

      // Success - use Response.next() pattern
      // In Next.js middleware, returning undefined or a response with
      // x-middleware-next header indicates request should continue
      return new Response(null, {
        headers: {
          'x-middleware-next': '1',
          'X-PEAC-Verified': 'true',
          'X-PEAC-Engine': 'tap',
        },
      });
    } catch (error) {
      // Internal error
      console.error('[PEAC] Middleware error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return new Response(
        JSON.stringify({
          type: 'https://peacprotocol.org/problems/internal_error',
          title: 'Internal Server Error',
          status: 500,
          detail: errorMessage,
          code: 'E_INTERNAL_ERROR',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }
  };
}

/**
 * Convenience wrapper for use with NextResponse.
 *
 * @example
 * ```typescript
 * import { NextResponse } from 'next/server';
 * import { withPeacVerification, LRUReplayStore } from '@peac/middleware-nextjs';
 *
 * const peacConfig = {
 *   issuerAllowlist: ['https://trusted-agent.example.com'],
 *   replayStore: new LRUReplayStore(),
 * };
 *
 * export async function middleware(request: NextRequest) {
 *   const errorResponse = await withPeacVerification(request, peacConfig);
 *   if (errorResponse) {
 *     return errorResponse;
 *   }
 *   return NextResponse.next();
 * }
 * ```
 */
export async function withPeacVerification(
  request: NextRequestLike,
  config: MiddlewareConfig
): Promise<Response | null> {
  const handlerRequest: HandlerRequest = {
    method: request.method,
    url: request.url,
    headers: headersToRecord(request.headers),
  };

  const result = await handleRequest(handlerRequest, config);

  if (result !== null) {
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  return null;
}
