/**
 * @peac/worker-cloudflare - RFC 9457 Problem Details errors
 *
 * Structured error responses for PEAC verification failures.
 */

import type { ProblemDetails } from './types.js';

/**
 * Error codes for worker verification failures.
 */
export const ErrorCodes = {
  // Receipt errors
  RECEIPT_MISSING: 'receipt_missing',
  RECEIPT_INVALID: 'receipt_invalid',
  RECEIPT_EXPIRED: 'receipt_expired',

  // TAP errors
  TAP_SIGNATURE_MISSING: 'tap_signature_missing',
  TAP_SIGNATURE_INVALID: 'tap_signature_invalid',
  TAP_TIME_INVALID: 'tap_time_invalid',
  TAP_WINDOW_TOO_LARGE: 'tap_window_too_large',
  TAP_TAG_UNKNOWN: 'tap_tag_unknown',
  TAP_ALGORITHM_INVALID: 'tap_algorithm_invalid',
  TAP_KEY_NOT_FOUND: 'tap_key_not_found',
  TAP_NONCE_REPLAY: 'tap_nonce_replay',

  // Issuer errors
  ISSUER_NOT_ALLOWED: 'issuer_not_allowed',

  // Internal errors
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for error types.
 */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  [ErrorCodes.RECEIPT_MISSING]: 402,
  [ErrorCodes.RECEIPT_INVALID]: 401,
  [ErrorCodes.RECEIPT_EXPIRED]: 401,

  [ErrorCodes.TAP_SIGNATURE_MISSING]: 401,
  [ErrorCodes.TAP_SIGNATURE_INVALID]: 401,
  [ErrorCodes.TAP_TIME_INVALID]: 401,
  [ErrorCodes.TAP_WINDOW_TOO_LARGE]: 400,
  [ErrorCodes.TAP_TAG_UNKNOWN]: 400,
  [ErrorCodes.TAP_ALGORITHM_INVALID]: 400,
  [ErrorCodes.TAP_KEY_NOT_FOUND]: 401,
  [ErrorCodes.TAP_NONCE_REPLAY]: 401,

  [ErrorCodes.ISSUER_NOT_ALLOWED]: 403,

  [ErrorCodes.INTERNAL_ERROR]: 500,
};

/**
 * Error titles for problem details.
 */
const ErrorTitles: Record<ErrorCode, string> = {
  [ErrorCodes.RECEIPT_MISSING]: 'Payment Required',
  [ErrorCodes.RECEIPT_INVALID]: 'Invalid Receipt',
  [ErrorCodes.RECEIPT_EXPIRED]: 'Receipt Expired',

  [ErrorCodes.TAP_SIGNATURE_MISSING]: 'Signature Missing',
  [ErrorCodes.TAP_SIGNATURE_INVALID]: 'Invalid Signature',
  [ErrorCodes.TAP_TIME_INVALID]: 'Invalid Signature Time',
  [ErrorCodes.TAP_WINDOW_TOO_LARGE]: 'Signature Window Too Large',
  [ErrorCodes.TAP_TAG_UNKNOWN]: 'Unknown TAP Tag',
  [ErrorCodes.TAP_ALGORITHM_INVALID]: 'Invalid Algorithm',
  [ErrorCodes.TAP_KEY_NOT_FOUND]: 'Key Not Found',
  [ErrorCodes.TAP_NONCE_REPLAY]: 'Nonce Replay Detected',

  [ErrorCodes.ISSUER_NOT_ALLOWED]: 'Issuer Not Allowed',

  [ErrorCodes.INTERNAL_ERROR]: 'Internal Server Error',
};

/**
 * Base URI for problem types.
 */
const PROBLEM_TYPE_BASE = 'https://peacprotocol.org/problems';

/**
 * Create RFC 9457 Problem Details object.
 */
export function createProblemDetails(
  code: ErrorCode,
  detail?: string,
  instance?: string
): ProblemDetails {
  return {
    type: `${PROBLEM_TYPE_BASE}/${code}`,
    title: ErrorTitles[code],
    status: ErrorHttpStatus[code],
    detail,
    instance,
  };
}

/**
 * Create RFC 9457 Problem Details response.
 */
export function createErrorResponse(code: ErrorCode, detail?: string, instance?: string): Response {
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
