/**
 * @peac/worker-akamai - RFC 9457 Problem Details errors
 *
 * Akamai-specific response creation.
 * Uses shared core for error code handling.
 *
 * @packageDocumentation
 */

import type { ProblemDetails, EWRequestHandler } from './types.js';
import { ErrorCodes, createProblemDetails } from '../../_shared/core/index.js';

// Re-export error codes from shared core
export { ErrorCodes };
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Re-export createProblemDetails for non-Response usage
export { createProblemDetails };

/**
 * Respond with RFC 9457 Problem Details.
 *
 * Uses Akamai's respondWith() API.
 *
 * @param handler - Akamai request handler
 * @param code - Error code
 * @param detail - Optional detail message
 * @param instance - Optional instance URI
 */
export function respondWithError(
  handler: EWRequestHandler,
  code: string,
  detail?: string,
  instance?: string
): void {
  const problem = createProblemDetails(code, detail, instance);

  handler.respondWith(
    problem.status,
    {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
    },
    JSON.stringify(problem)
  );
}

/**
 * Respond with 402 Payment Required challenge.
 *
 * Includes WWW-Authenticate header for PEAC challenge.
 *
 * @param handler - Akamai request handler
 * @param requestUrl - Request URL for instance field
 */
export function respondWithChallenge(handler: EWRequestHandler, requestUrl: string): void {
  const problem = createProblemDetails(
    ErrorCodes.RECEIPT_MISSING,
    'A valid PEAC receipt is required to access this resource.',
    requestUrl
  );

  handler.respondWith(
    402,
    {
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate': 'PEAC realm="peac-verifier"',
      'Cache-Control': 'no-store',
    },
    JSON.stringify(problem)
  );
}

/**
 * Create error response for testing.
 *
 * Returns a standard Response object instead of using handler.respondWith().
 *
 * @param code - Error code
 * @param detail - Optional detail message
 * @param instance - Optional instance URI
 * @returns Response object
 */
export function createErrorResponse(code: string, detail?: string, instance?: string): Response {
  const problem = createProblemDetails(code, detail, instance);

  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Create 402 challenge response for testing.
 *
 * @param requestUrl - Request URL for instance field
 * @returns Response object
 */
export function createChallengeResponse(requestUrl: string): Response {
  const problem = createProblemDetails(
    ErrorCodes.RECEIPT_MISSING,
    'A valid PEAC receipt is required to access this resource.',
    requestUrl
  );

  return new Response(JSON.stringify(problem), {
    status: 402,
    headers: {
      'Content-Type': 'application/problem+json',
      'WWW-Authenticate': 'PEAC realm="peac-verifier"',
      'Cache-Control': 'no-store',
    },
  });
}
