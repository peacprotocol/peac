/**
 * Canonical PEAC error codes.
 *
 * This is the single source of truth for error code values.
 * All other modules import from here to avoid circular dependencies.
 */

/**
 * Canonical PEAC error codes.
 *
 * Format: E_<CATEGORY>_<ERROR>
 *
 * All error codes use the E_ prefix for consistency with RFC/IETF error code conventions.
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
 * PEAC error code type (union of all canonical error codes).
 *
 * Use this type for compile-time safety when handling error codes.
 */
export type PeacErrorCode = (typeof CANONICAL_ERROR_CODES)[keyof typeof CANONICAL_ERROR_CODES];
