/**
 * @peac/worker-fastly - RFC 9457 Problem Details errors
 *
 * Fastly-specific response creation.
 * Uses shared core for error code handling.
 *
 * @packageDocumentation
 */

import type { ProblemDetails } from './types.js';
import { ErrorCodes, createProblemDetails } from '../../_shared/core/index.js';

// Re-export error codes from shared core
export { ErrorCodes };
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Re-export createProblemDetails for non-Response usage
export { createProblemDetails };

/**
 * Create RFC 9457 Problem Details response.
 *
 * @param code - Error code
 * @param detail - Optional detail message
 * @param instance - Optional instance URI
 * @returns Fastly Response
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
 * Create 402 Payment Required response.
 *
 * Includes WWW-Authenticate header for PEAC challenge.
 *
 * @param requestUrl - Request URL for instance field
 * @returns Fastly Response
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
