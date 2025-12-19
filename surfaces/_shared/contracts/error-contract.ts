/**
 * PEAC Surface Error Contract
 *
 * Canonical error codes and HTTP status mappings that ALL surface implementations
 * MUST match exactly. This file serves as the single source of truth for parity testing.
 *
 * @see surfaces/workers/cloudflare/src/errors.ts
 * @see surfaces/nextjs/middleware/src/errors.ts
 */

/**
 * Canonical error codes.
 *
 * Format: E_<CATEGORY>_<ERROR>
 */
export const CANONICAL_ERROR_CODES = {
  // Receipt errors (402 - Payment Required)
  RECEIPT_MISSING: 'E_RECEIPT_MISSING',
  RECEIPT_INVALID: 'E_RECEIPT_INVALID',
  RECEIPT_EXPIRED: 'E_RECEIPT_EXPIRED',

  // TAP errors (401 - Authentication)
  TAP_SIGNATURE_MISSING: 'E_TAP_SIGNATURE_MISSING',
  TAP_SIGNATURE_INVALID: 'E_TAP_SIGNATURE_INVALID',
  TAP_TIME_INVALID: 'E_TAP_TIME_INVALID',
  TAP_WINDOW_TOO_LARGE: 'E_TAP_WINDOW_TOO_LARGE',
  TAP_TAG_UNKNOWN: 'E_TAP_TAG_UNKNOWN',
  TAP_ALGORITHM_INVALID: 'E_TAP_ALGORITHM_INVALID',
  TAP_KEY_NOT_FOUND: 'E_TAP_KEY_NOT_FOUND',

  // Replay error (409 - Conflict)
  TAP_NONCE_REPLAY: 'E_TAP_NONCE_REPLAY',

  // Replay protection required (401 - requires config change)
  TAP_REPLAY_PROTECTION_REQUIRED: 'E_TAP_REPLAY_PROTECTION_REQUIRED',

  // Issuer errors (403 - Forbidden)
  ISSUER_NOT_ALLOWED: 'E_ISSUER_NOT_ALLOWED',

  // Configuration errors (500 - Server misconfiguration)
  CONFIG_ISSUER_ALLOWLIST_REQUIRED: 'E_CONFIG_ISSUER_ALLOWLIST_REQUIRED',

  // Internal errors (500)
  INTERNAL_ERROR: 'E_INTERNAL_ERROR',
} as const;

/**
 * Canonical HTTP status code mappings.
 *
 * Status code semantics:
 * - 400: Client error (malformed request, invalid parameters)
 * - 401: Authentication required (missing/invalid credentials)
 * - 402: Payment Required (reserved for PEAC receipt payment flows)
 * - 403: Forbidden (authenticated but not authorized)
 * - 409: Conflict (replay detection - request conflicts with previous state)
 * - 500: Server error (configuration, internal failure)
 */
export const CANONICAL_STATUS_MAPPINGS: Record<string, number> = {
  // 402 - Payment Required (reserved for payment flows)
  [CANONICAL_ERROR_CODES.RECEIPT_MISSING]: 402,
  [CANONICAL_ERROR_CODES.RECEIPT_INVALID]: 402,
  [CANONICAL_ERROR_CODES.RECEIPT_EXPIRED]: 402,

  // 401 - Authentication errors
  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING]: 401,
  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID]: 401,
  [CANONICAL_ERROR_CODES.TAP_TIME_INVALID]: 401,
  [CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND]: 401,
  [CANONICAL_ERROR_CODES.TAP_REPLAY_PROTECTION_REQUIRED]: 401,

  // 400 - Client errors (malformed)
  [CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE]: 400,
  [CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN]: 400,
  [CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID]: 400,

  // 403 - Forbidden (issuer not in allowlist)
  [CANONICAL_ERROR_CODES.ISSUER_NOT_ALLOWED]: 403,

  // 409 - Conflict (replay detected)
  [CANONICAL_ERROR_CODES.TAP_NONCE_REPLAY]: 409,

  // 500 - Server errors
  [CANONICAL_ERROR_CODES.CONFIG_ISSUER_ALLOWLIST_REQUIRED]: 500,
  [CANONICAL_ERROR_CODES.INTERNAL_ERROR]: 500,
};

/**
 * Canonical error titles.
 */
export const CANONICAL_TITLES: Record<string, string> = {
  [CANONICAL_ERROR_CODES.RECEIPT_MISSING]: 'Payment Required',
  [CANONICAL_ERROR_CODES.RECEIPT_INVALID]: 'Invalid Receipt',
  [CANONICAL_ERROR_CODES.RECEIPT_EXPIRED]: 'Receipt Expired',

  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING]: 'Signature Missing',
  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID]: 'Invalid Signature',
  [CANONICAL_ERROR_CODES.TAP_TIME_INVALID]: 'Invalid Signature Time',
  [CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE]: 'Signature Window Too Large',
  [CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN]: 'Unknown TAP Tag',
  [CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID]: 'Invalid Algorithm',
  [CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND]: 'Key Not Found',
  [CANONICAL_ERROR_CODES.TAP_NONCE_REPLAY]: 'Nonce Replay Detected',
  [CANONICAL_ERROR_CODES.TAP_REPLAY_PROTECTION_REQUIRED]: 'Replay Protection Required',

  [CANONICAL_ERROR_CODES.ISSUER_NOT_ALLOWED]: 'Issuer Not Allowed',

  [CANONICAL_ERROR_CODES.CONFIG_ISSUER_ALLOWLIST_REQUIRED]: 'Configuration Error',
  [CANONICAL_ERROR_CODES.INTERNAL_ERROR]: 'Internal Server Error',
};

/**
 * Base URI for problem types.
 */
export const PROBLEM_TYPE_BASE = 'https://peacprotocol.org/problems';

/**
 * Verification mode behavior contract.
 *
 * Defines expected HTTP status when no TAP headers are present.
 */
export const MODE_BEHAVIOR = {
  receipt_or_tap: {
    noTapHeadersStatus: 402,
    noTapHeadersCode: CANONICAL_ERROR_CODES.RECEIPT_MISSING,
  },
  tap_only: {
    noTapHeadersStatus: 401,
    noTapHeadersCode: CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING,
  },
} as const;
