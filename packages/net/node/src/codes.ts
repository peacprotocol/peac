/**
 * Error codes for @peac/net-node
 *
 * Single source of truth for all error codes used in this package.
 * Both index.ts (public API) and impl.ts (internal) import from here.
 *
 * STABILITY: These identifiers are part of the public API surface.
 * Consumers may log, alert, or persist these codes. Changes to code
 * values are breaking changes and require a major version bump.
 *
 * @module @peac/net-node
 */

/**
 * All error codes for safeFetch operations
 *
 * These codes are designed for audit-clean logging:
 * - Each failure mode has a distinct code
 * - Codes follow E_NET_* namespace
 * - Reason suffix indicates specific cause for mixed scenarios
 */
export const SAFE_FETCH_ERROR_CODES = {
  // SSRF errors
  E_SSRF_URL_REJECTED: 'E_NET_SSRF_URL_REJECTED',
  E_SSRF_DNS_RESOLVED_PRIVATE: 'E_NET_SSRF_DNS_RESOLVED_PRIVATE',
  E_SSRF_ALL_IPS_BLOCKED: 'E_NET_SSRF_ALL_IPS_BLOCKED',
  E_SSRF_REDIRECT_BLOCKED: 'E_NET_SSRF_REDIRECT_BLOCKED',
  E_SSRF_TOO_MANY_REDIRECTS: 'E_NET_SSRF_TOO_MANY_REDIRECTS',
  E_SSRF_ALLOWCIDRS_ACK_REQUIRED: 'E_NET_SSRF_ALLOWCIDRS_ACK_REQUIRED',
  E_SSRF_IPV6_ZONE_ID: 'E_NET_SSRF_IPV6_ZONE_ID',
  E_SSRF_INVALID_HOST: 'E_NET_SSRF_INVALID_HOST',
  // P0.2: Mixed DNS audit-clean reason codes
  E_SSRF_MIXED_DNS_BLOCKED: 'E_NET_SSRF_MIXED_DNS_BLOCKED',
  E_SSRF_MIXED_DNS_ACK_MISSING: 'E_NET_SSRF_MIXED_DNS_ACK_MISSING',
  // Port security
  E_SSRF_DANGEROUS_PORT: 'E_NET_SSRF_DANGEROUS_PORT',
  E_SSRF_DANGEROUS_PORT_ACK_MISSING: 'E_NET_SSRF_DANGEROUS_PORT_ACK_MISSING',
  // Evidence configuration
  E_TENANT_KEY_MISSING: 'E_NET_TENANT_KEY_MISSING',
  // Network errors
  E_DNS_RESOLUTION_FAILED: 'E_NET_DNS_RESOLUTION_FAILED',
  E_REQUEST_TIMEOUT: 'E_NET_REQUEST_TIMEOUT',
  // P1.3: Phase-specific timeout codes for audit trail
  E_DNS_TIMEOUT: 'E_NET_DNS_TIMEOUT',
  E_CONNECT_TIMEOUT: 'E_NET_CONNECT_TIMEOUT',
  E_HEADERS_TIMEOUT: 'E_NET_HEADERS_TIMEOUT',
  E_BODY_TIMEOUT: 'E_NET_BODY_TIMEOUT',
  E_NETWORK_ERROR: 'E_NET_NETWORK_ERROR',
  // Method/size errors
  E_METHOD_NOT_ALLOWED: 'E_NET_METHOD_NOT_ALLOWED',
  E_RESPONSE_TOO_LARGE: 'E_NET_RESPONSE_TOO_LARGE',
  E_PARSE_ERROR: 'E_NET_PARSE_ERROR',
} as const;

export type SafeFetchErrorCode =
  (typeof SAFE_FETCH_ERROR_CODES)[keyof typeof SAFE_FETCH_ERROR_CODES];
