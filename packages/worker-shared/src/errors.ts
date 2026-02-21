/**
 * PEAC Shared Worker Core - Error Utilities
 *
 * RFC 9457 Problem Details creation for edge workers.
 * Uses canonical error codes from contracts.
 *
 * @packageDocumentation
 */

import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  CANONICAL_TITLES,
  PROBLEM_TYPE_BASE,
  type PeacErrorCode,
} from '@peac/contracts';
import type { ProblemDetails } from './types.js';

// Re-export canonical error codes for convenience
export { CANONICAL_ERROR_CODES as ErrorCodes };
export type ErrorCode = keyof typeof CANONICAL_ERROR_CODES;
export type ErrorCodeValue = (typeof CANONICAL_ERROR_CODES)[ErrorCode];

/**
 * Sanitize error detail to prevent leaking sensitive information.
 *
 * Removes or redacts:
 * - Signature header values
 * - Key material
 * - Internal paths
 */
export function sanitizeDetail(detail: string | undefined): string | undefined {
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
 *
 * @param code - Canonical error code value (e.g., 'E_RECEIPT_MISSING')
 * @param detail - Optional detail message
 * @param instance - Optional instance URI (usually request URL)
 * @returns Problem Details object
 */
export function createProblemDetails(
  code: string,
  detail?: string,
  instance?: string
): ProblemDetails {
  // Cast to PeacErrorCode for type-safe indexing
  const peacCode = code as PeacErrorCode;

  // Map code to URL-safe slug for type URI
  const typeSlug = code.toLowerCase().replace(/^e_/, '');

  return {
    type: `${PROBLEM_TYPE_BASE}/${typeSlug}`,
    title: CANONICAL_TITLES[peacCode] ?? 'Error',
    status: CANONICAL_STATUS_MAPPINGS[peacCode] ?? 500,
    detail: sanitizeDetail(detail),
    instance,
    code, // Stable error code extension
  };
}

/**
 * Get HTTP status for an error code.
 *
 * @param code - Error code
 * @returns HTTP status code
 */
export function getStatusForCode(code: string): number {
  return CANONICAL_STATUS_MAPPINGS[code as PeacErrorCode] ?? 500;
}

/**
 * Map TAP error code to worker error code.
 *
 * TAP library uses some different prefixes, this normalizes them.
 */
export function mapTapErrorCode(tapErrorCode: string | undefined): string {
  if (!tapErrorCode) {
    return CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID;
  }

  // Already a canonical code
  if (tapErrorCode in CANONICAL_STATUS_MAPPINGS) {
    return tapErrorCode;
  }

  // Map common TAP library error codes
  const mapping: Record<string, string> = {
    E_TAP_WINDOW_TOO_LARGE: CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE,
    E_TAP_TIME_INVALID: CANONICAL_ERROR_CODES.TAP_TIME_INVALID,
    E_TAP_ALGORITHM_INVALID: CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID,
    E_TAP_TAG_UNKNOWN: CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN,
    E_SIGNATURE_INVALID: CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID,
    E_KEY_NOT_FOUND: CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND,
  };

  return mapping[tapErrorCode] ?? CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID;
}
