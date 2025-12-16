/**
 * @peac/worker-cloudflare - RFC 9457 Problem Details errors
 *
 * Structured error responses for PEAC verification failures.
 *
 * SECURITY: Error details MUST NOT contain sensitive data such as:
 * - Raw Signature or Signature-Input header values
 * - Private key material
 * - Internal paths or configuration
 */

import type { ProblemDetails } from './types.js';

/**
 * Stable error codes for worker verification failures.
 *
 * These codes are included in the `code` extension field for programmatic handling.
 * Format: E_<CATEGORY>_<ERROR>
 */
export const ErrorCodes = {
  // Receipt errors
  RECEIPT_MISSING: 'E_RECEIPT_MISSING',
  RECEIPT_INVALID: 'E_RECEIPT_INVALID',
  RECEIPT_EXPIRED: 'E_RECEIPT_EXPIRED',

  // TAP errors
  TAP_SIGNATURE_MISSING: 'E_TAP_SIGNATURE_MISSING',
  TAP_SIGNATURE_INVALID: 'E_TAP_SIGNATURE_INVALID',
  TAP_TIME_INVALID: 'E_TAP_TIME_INVALID',
  TAP_WINDOW_TOO_LARGE: 'E_TAP_WINDOW_TOO_LARGE',
  TAP_TAG_UNKNOWN: 'E_TAP_TAG_UNKNOWN',
  TAP_ALGORITHM_INVALID: 'E_TAP_ALGORITHM_INVALID',
  TAP_KEY_NOT_FOUND: 'E_TAP_KEY_NOT_FOUND',
  TAP_NONCE_REPLAY: 'E_TAP_NONCE_REPLAY',

  // Issuer errors
  ISSUER_NOT_ALLOWED: 'E_ISSUER_NOT_ALLOWED',

  // Internal errors
  INTERNAL_ERROR: 'E_INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status codes for error types.
 */
const ErrorHttpStatus: Record<ErrorCode, number> = {
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
 * Sanitize error detail to prevent leaking sensitive information.
 *
 * Removes or redacts:
 * - Signature header values
 * - Key material
 * - Internal paths
 */
function sanitizeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;

  // Redact anything that looks like a signature or key
  return detail
    .replace(/sig1=:[A-Za-z0-9+/=]+:/g, 'sig1:[REDACTED]:')
    .replace(/signature[:\s]*[A-Za-z0-9+/=]{20,}/gi, 'signature:[REDACTED]')
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[REDACTED KEY]');
}

/**
 * Create RFC 9457 Problem Details object.
 *
 * Includes stable `code` extension for programmatic error handling.
 */
export function createProblemDetails(
  code: ErrorCode,
  detail?: string,
  instance?: string
): ProblemDetails {
  // Map code to URL-safe slug for type URI
  const typeSlug = code.toLowerCase().replace(/^e_/, '');

  return {
    type: `${PROBLEM_TYPE_BASE}/${typeSlug}`,
    title: ErrorTitles[code],
    status: ErrorHttpStatus[code],
    detail: sanitizeDetail(detail),
    instance,
    code, // Stable error code extension
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
