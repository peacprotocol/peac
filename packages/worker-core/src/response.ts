/**
 * PEAC Worker Core - Response Builder
 *
 * Builds RFC 9457 Problem Details responses with all required headers:
 * - Content-Type: application/problem+json
 * - WWW-Authenticate: PEAC realm="peac", error="<code>", error_uri="<uri>" (401 and 402)
 * - X-PEAC-Error: <code>
 * - Cache-Control: no-store
 * - Retry-After: <seconds> (503 only)
 *
 * @packageDocumentation
 */

import type { TapControlEntry } from '@peac/mappings-tap';
import { ErrorCodes, ErrorStatusMap, type ProblemDetails } from './errors.js';
import {
  CANONICAL_TITLES,
  problemTypeFor,
  requiresWwwAuthenticate,
  buildWwwAuthenticate,
  type PeacErrorCode,
} from '@peac/contracts';

/**
 * Response parts for platform-neutral response building.
 */
export interface ResponseParts {
  status: number;
  headers: Record<string, string>;
  body: ProblemDetails;
}

/**
 * Build RFC 9457 Problem Details response with all required headers.
 *
 * @param code - Error code
 * @param detail - Optional detail message
 * @param instance - Optional instance URI
 * @param retryAfter - Optional retry-after seconds (for 503)
 * @returns Response parts with status, headers, and body
 */
export function buildErrorResponse(
  code: string,
  detail?: string,
  instance?: string,
  retryAfter?: number
): ResponseParts {
  const peacCode = code as PeacErrorCode;
  const status = ErrorStatusMap[peacCode] ?? 500;
  const title = CANONICAL_TITLES[peacCode] ?? 'Unknown Error';

  const body: ProblemDetails = {
    type: problemTypeFor(peacCode),
    title,
    status,
    code,
    ...(detail && { detail }),
    ...(instance && { instance }),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/problem+json',
    'X-PEAC-Error': code,
    'Cache-Control': 'no-store',
  };

  // Add WWW-Authenticate for 401 AND 402 responses (contract-driven)
  if (requiresWwwAuthenticate(status)) {
    headers['WWW-Authenticate'] = buildWwwAuthenticate(peacCode);
  }

  // Add Retry-After for 503 responses
  if (status === 503 && retryAfter !== undefined) {
    headers['Retry-After'] = String(retryAfter);
  }

  return {
    status,
    headers,
    body,
  };
}

/**
 * Build 402 Payment Required challenge response.
 *
 * This is a convenience wrapper for the common case of returning
 * a 402 response when TAP is missing in receipt_or_tap mode.
 *
 * @param detail - Detail message
 * @param instance - Optional request URL
 * @returns Response parts for 402 challenge
 */
export function buildChallengeResponse(detail: string, instance?: string): ResponseParts {
  return buildErrorResponse(ErrorCodes.RECEIPT_MISSING, detail, instance);
}

/**
 * Build forward headers for successful verification.
 *
 * @param controlEntry - TAP control entry (optional)
 * @param warning - Warning message (optional)
 * @returns Headers to add to forwarded request
 */
export function buildForwardHeaders(
  controlEntry?: TapControlEntry,
  warning?: string
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (controlEntry) {
    // Add verified issuer info for upstream
    headers['X-PEAC-Issuer'] = controlEntry.evidence.keyid ?? '';
  }

  if (warning) {
    // RFC 7234 Warning header format
    headers['Warning'] = `199 peac "${warning}"`;
  }

  return headers;
}
