/**
 * PEAC Canonical Contracts
 *
 * Single source of truth for error codes, HTTP status mappings, and verification mode behavior.
 * All surface implementations MUST import from this package to prevent drift.
 *
 * @packageDocumentation
 */

/**
 * Base URI for RFC 9457 Problem Details type field.
 */
export const PROBLEM_TYPE_BASE = 'https://peacprotocol.org/problems';

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
export const CANONICAL_STATUS_MAPPINGS: Record<PeacErrorCode, number> = {
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
 * Canonical error titles for RFC 9457 Problem Details.
 */
export const CANONICAL_TITLES: Record<PeacErrorCode, string> = {
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
 * Verification mode.
 *
 * Determines behavior when TAP headers are missing:
 * - tap_only: Missing TAP → 401 + E_TAP_SIGNATURE_MISSING (authentication required)
 * - receipt_or_tap: Missing TAP → 402 + E_RECEIPT_MISSING (payment remedy)
 */
export type VerificationMode = 'tap_only' | 'receipt_or_tap';

/**
 * Handler action type.
 *
 * Determines how the handler should respond:
 * - error: Authentication/authorization error
 * - challenge: Payment challenge (402 only)
 * - pass: Bypass verification (bypass paths)
 * - forward: Verification succeeded, forward request
 */
export type HandlerAction = 'error' | 'challenge' | 'pass' | 'forward';

/**
 * Mode behavior for missing TAP headers.
 */
export interface ModeBehavior {
  /** HTTP status code */
  status: number;
  /** PEAC error code */
  code: PeacErrorCode;
  /** Handler action */
  action: HandlerAction;
}

/**
 * Verification mode behavior contract.
 *
 * Defines expected HTTP status, error code, and action when no TAP headers are present.
 * This is the canonical source of truth for mode-based behavior.
 */
export const MODE_BEHAVIOR: Record<VerificationMode, ModeBehavior> = {
  receipt_or_tap: {
    status: 402,
    code: CANONICAL_ERROR_CODES.RECEIPT_MISSING,
    action: 'challenge',
  },
  tap_only: {
    status: 401,
    code: CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING,
    action: 'error',
  },
} as const;

/**
 * HTTP status codes that require WWW-Authenticate header.
 *
 * Per v0.9.27 decision: WWW-Authenticate is sent on both 401 (auth required) and 402 (payment remedy).
 */
export const WWW_AUTHENTICATE_STATUSES = [401, 402] as const;

/**
 * Get RFC 9457 Problem Details type URI for an error code.
 *
 * @param code - PEAC error code
 * @returns Problem Details type URI (e.g., "https://peacprotocol.org/problems/E_TAP_SIGNATURE_MISSING")
 */
export function problemTypeFor(code: PeacErrorCode): string {
  return `${PROBLEM_TYPE_BASE}/${code}`;
}

/**
 * Error catalog entry.
 */
export interface ErrorCatalogEntry {
  /** HTTP status code */
  status: number;
  /** RFC 9457 title */
  title: string;
  /** Default detail message (can be overridden at runtime) */
  defaultDetail?: string;
}

/**
 * Error catalog with HTTP status, title, and default detail for each error code.
 *
 * Use this for constructing RFC 9457 Problem Details responses.
 */
export const ERROR_CATALOG: Record<PeacErrorCode, ErrorCatalogEntry> = {
  [CANONICAL_ERROR_CODES.RECEIPT_MISSING]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.RECEIPT_MISSING],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.RECEIPT_MISSING],
    defaultDetail: 'A valid PEAC receipt is required to access this resource.',
  },
  [CANONICAL_ERROR_CODES.RECEIPT_INVALID]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.RECEIPT_INVALID],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.RECEIPT_INVALID],
    defaultDetail: 'The provided receipt is invalid.',
  },
  [CANONICAL_ERROR_CODES.RECEIPT_EXPIRED]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.RECEIPT_EXPIRED],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.RECEIPT_EXPIRED],
    defaultDetail: 'The provided receipt has expired.',
  },

  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING],
    defaultDetail: 'TAP signature headers are required.',
  },
  [CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_SIGNATURE_INVALID],
    defaultDetail: 'TAP signature verification failed.',
  },
  [CANONICAL_ERROR_CODES.TAP_TIME_INVALID]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_TIME_INVALID],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_TIME_INVALID],
    defaultDetail: 'TAP signature time is invalid.',
  },
  [CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_WINDOW_TOO_LARGE],
    defaultDetail: 'TAP signature time window exceeds maximum allowed.',
  },
  [CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_TAG_UNKNOWN],
    defaultDetail: 'Unknown TAP tag in signature.',
  },
  [CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_ALGORITHM_INVALID],
    defaultDetail: 'TAP signature algorithm is invalid.',
  },
  [CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_KEY_NOT_FOUND],
    defaultDetail: 'TAP signing key not found.',
  },
  [CANONICAL_ERROR_CODES.TAP_NONCE_REPLAY]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_NONCE_REPLAY],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_NONCE_REPLAY],
    defaultDetail: 'Nonce replay detected.',
  },
  [CANONICAL_ERROR_CODES.TAP_REPLAY_PROTECTION_REQUIRED]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.TAP_REPLAY_PROTECTION_REQUIRED],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.TAP_REPLAY_PROTECTION_REQUIRED],
    defaultDetail:
      'Replay protection required but not configured. Set UNSAFE_ALLOW_NO_REPLAY=true to bypass (UNSAFE for production).',
  },

  [CANONICAL_ERROR_CODES.ISSUER_NOT_ALLOWED]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.ISSUER_NOT_ALLOWED],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.ISSUER_NOT_ALLOWED],
    defaultDetail: 'Issuer not in allowlist.',
  },

  [CANONICAL_ERROR_CODES.CONFIG_ISSUER_ALLOWLIST_REQUIRED]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.CONFIG_ISSUER_ALLOWLIST_REQUIRED],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.CONFIG_ISSUER_ALLOWLIST_REQUIRED],
    defaultDetail:
      'Worker misconfigured: ISSUER_ALLOWLIST is required. Set UNSAFE_ALLOW_ANY_ISSUER=true to bypass (UNSAFE for production).',
  },
  [CANONICAL_ERROR_CODES.INTERNAL_ERROR]: {
    status: CANONICAL_STATUS_MAPPINGS[CANONICAL_ERROR_CODES.INTERNAL_ERROR],
    title: CANONICAL_TITLES[CANONICAL_ERROR_CODES.INTERNAL_ERROR],
    defaultDetail: 'An internal server error occurred.',
  },
};

/**
 * Get HTTP status code for a PEAC error code.
 *
 * @param code - PEAC error code
 * @returns HTTP status code
 */
export function getStatusForCode(code: PeacErrorCode): number {
  return CANONICAL_STATUS_MAPPINGS[code];
}

/**
 * Check if HTTP status requires WWW-Authenticate header.
 *
 * @param status - HTTP status code
 * @returns true if WWW-Authenticate header is required
 */
export function requiresWwwAuthenticate(status: number): boolean {
  return WWW_AUTHENTICATE_STATUSES.includes(status as 401 | 402);
}

/**
 * Build canonical WWW-Authenticate header value.
 *
 * Format: PEAC realm="<realm>", error="<code>", error_uri="<uri>"
 *
 * @param code - PEAC error code
 * @param realm - Authentication realm (default: "peac")
 * @returns Canonical WWW-Authenticate header value
 */
export function buildWwwAuthenticate(code: PeacErrorCode, realm = 'peac'): string {
  return `PEAC realm="${realm}", error="${code}", error_uri="${problemTypeFor(code)}"`;
}

/**
 * Valid PEAC HTTP status codes.
 *
 * All status codes that can be returned by PEAC verification handlers.
 */
export type PeacHttpStatus = 400 | 401 | 402 | 403 | 409 | 500;

/**
 * Set of all canonical PEAC error codes for O(1) validation.
 *
 * @internal
 */
const PEAC_ERROR_CODE_SET = new Set<string>(Object.values(CANONICAL_ERROR_CODES));

/**
 * Type guard to check if a value is a valid PEAC error code.
 *
 * Uses O(1) Set lookup for performance.
 *
 * @param x - Value to check
 * @returns true if x is a valid PeacErrorCode
 *
 * @example
 * ```typescript
 * if (isPeacErrorCode(code)) {
 *   // TypeScript now knows code is PeacErrorCode
 *   const status = getStatusForCode(code);
 * }
 * ```
 */
export function isPeacErrorCode(x: unknown): x is PeacErrorCode {
  return typeof x === 'string' && PEAC_ERROR_CODE_SET.has(x);
}
