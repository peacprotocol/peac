/**
 * PEAC Worker Core - Error Codes and Utilities
 *
 * Canonical error codes with HTTP status mappings.
 * Implements RFC 9457 Problem Details.
 *
 * HTTP Status Code Semantics:
 * - 400: Bad Request - Malformed input, invalid format, unknown tags
 * - 401: Unauthorized - Missing/invalid auth proof (TAP headers)
 * - 402: Payment Required - Receipt required AND remedy is payment/settlement
 * - 403: Forbidden - Policy denied, issuer not in allowlist
 * - 409: Conflict - Replay detected (nonce reuse)
 * - 500: Internal Server Error - Configuration error (fail fast at startup preferred)
 * - 503: Service Unavailable - Transient infra (JWKS fetch failed)
 *
 * CRITICAL: 402 is ONLY used when the remedy is "obtain a receipt via payment/settlement".
 * Missing TAP headers is 401, NOT 402.
 *
 * @packageDocumentation
 */

import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  ERROR_CATALOG,
  problemTypeFor,
  getStatusForCode as getCanonicalStatus,
  type PeacErrorCode,
  type ErrorCatalogEntry,
} from '@peac/contracts';

/**
 * RFC 9457 Problem Details structure.
 */
export interface ProblemDetails {
  /** Problem type URI */
  type: string;
  /** Short human-readable summary */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation (sanitized) */
  detail?: string;
  /** URI identifying the specific occurrence */
  instance?: string;
  /** Error code (extension field) */
  code: string;
}

/**
 * Canonical error codes (re-exported from @peac/contracts).
 *
 * Use these codes for programmatic error handling.
 */
export const ErrorCodes = CANONICAL_ERROR_CODES;

export type ErrorCode = PeacErrorCode;
export type ErrorCodeValue = PeacErrorCode;

/**
 * HTTP status mappings (re-exported from @peac/contracts).
 *
 * CRITICAL: 402 is ONLY for payment remedy. TAP errors are 401.
 */
export const ErrorStatusMap = CANONICAL_STATUS_MAPPINGS;

/**
 * Alias for ERROR_STATUS_MAP (SCREAMING_SNAKE_CASE naming convention).
 */
export const ERROR_STATUS_MAP = ErrorStatusMap;

/**
 * Error catalog (re-exported from @peac/contracts).
 */
export { ERROR_CATALOG };

/**
 * Get HTTP status for an error code.
 *
 * @param code - Error code
 * @returns HTTP status code (defaults to 500 for unknown codes)
 */
export function getStatusForCode(code: string): number {
  const status = ErrorStatusMap[code as PeacErrorCode];
  return status ?? 500;
}

/**
 * Alias for getStatusForCode.
 */
export const getStatusForError = getStatusForCode;

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

  return detail
    .replace(/sig1=:[A-Za-z0-9+/=]+:/g, 'sig1:[REDACTED]:')
    .replace(/signature[:\s]*[A-Za-z0-9+/=]{20,}/gi, 'signature:[REDACTED]')
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[REDACTED KEY]');
}

/**
 * Create RFC 9457 Problem Details object.
 *
 * @param code - Error code
 * @param detail - Optional detail message (will be sanitized)
 * @param instance - Optional instance URI (usually request URL)
 * @returns Problem Details object
 */
export function createProblemDetails(
  code: string,
  detail?: string,
  instance?: string
): ProblemDetails {
  const peacCode = code as PeacErrorCode;
  const catalogEntry = ERROR_CATALOG[peacCode];

  return {
    type: problemTypeFor(peacCode),
    title: catalogEntry?.title ?? 'Unknown Error',
    status: catalogEntry?.status ?? 500,
    detail: sanitizeDetail(detail ?? catalogEntry?.defaultDetail),
    instance,
    code,
  };
}

/**
 * Map TAP library error code to canonical PEAC error code.
 *
 * Normalizes various TAP error code formats to canonical E_* codes.
 */
export function mapTapErrorCode(tapErrorCode: string | undefined): PeacErrorCode {
  if (!tapErrorCode) {
    return ErrorCodes.TAP_SIGNATURE_INVALID;
  }

  // Already a canonical code
  if (tapErrorCode in ErrorStatusMap) {
    return tapErrorCode as PeacErrorCode;
  }

  // Map common TAP library error codes to canonical E_* codes
  const mapping: Record<string, PeacErrorCode> = {
    // From @peac/mappings-tap (E_* format)
    E_TAP_WINDOW_TOO_LARGE: ErrorCodes.TAP_WINDOW_TOO_LARGE,
    E_TAP_TIME_INVALID: ErrorCodes.TAP_TIME_INVALID,
    E_TAP_ALGORITHM_INVALID: ErrorCodes.TAP_ALGORITHM_INVALID,
    E_TAP_TAG_UNKNOWN: ErrorCodes.TAP_TAG_UNKNOWN,
    E_SIGNATURE_INVALID: ErrorCodes.TAP_SIGNATURE_INVALID,
    E_KEY_NOT_FOUND: ErrorCodes.TAP_KEY_NOT_FOUND,
    E_TAP_SIGNATURE_MISSING: ErrorCodes.TAP_SIGNATURE_MISSING,

    // Legacy snake_case compatibility (pre-v0.9.28)
    tap_window_too_large: ErrorCodes.TAP_WINDOW_TOO_LARGE,
    tap_time_invalid: ErrorCodes.TAP_TIME_INVALID,
    tap_algorithm_invalid: ErrorCodes.TAP_ALGORITHM_INVALID,
    tap_tag_unknown: ErrorCodes.TAP_TAG_UNKNOWN,
    tap_signature_invalid: ErrorCodes.TAP_SIGNATURE_INVALID,
    signature_invalid: ErrorCodes.TAP_SIGNATURE_INVALID,
    tap_key_not_found: ErrorCodes.TAP_KEY_NOT_FOUND,
    key_not_found: ErrorCodes.TAP_KEY_NOT_FOUND,
    tap_headers_missing: ErrorCodes.TAP_SIGNATURE_MISSING,
    tap_nonce_replay: ErrorCodes.TAP_NONCE_REPLAY,
    tap_replay_protection_required: ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED,
  };

  return mapping[tapErrorCode] ?? ErrorCodes.TAP_SIGNATURE_INVALID;
}
