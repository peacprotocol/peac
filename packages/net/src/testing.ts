/**
 * @peac/net-node Testing Utilities
 *
 * This module exports internal utilities for testing purposes only.
 * These APIs are NOT part of the public contract and may change without notice.
 *
 * Import via:
 *   import { _internals } from '@peac/net-node/testing';
 *
 * DO NOT use these in production code.
 *
 * @module @peac/net-node/testing
 */

// Import internal functions from impl.ts (the internal implementation module)
import {
  // Core validation
  isPrivateIP,
  resolveDnsSecure,
  createPinnedAgent,
  // CIDR utilities
  parseCidr,
  matchesAnyCidr,
  validateAllowCidrsAck,
  cidrOverlapsDangerousRanges,
  // URL/hostname utilities
  getRegistrableDomain,
  isRedirectAllowed,
  normalizeHostname,
  sanitizeUrl,
  // Response handling
  readBodyWithLimit,
  attemptWithFallback,
  // Header utilities
  hasHeaderCaseInsensitive,
  stripHopByHopHeaders,
  // Canonical host pipeline
  hasIPv6ZoneId,
  normalizeIPv4MappedIPv6,
  canonicalizeHost,
  // Audit helpers
  emitAuditEvent,
  createRequestAuditContext,
  // Evidence redaction helpers
  hashIpAddress,
  redactIp,
  // Audit queue helpers (for testing)
  resetAuditQueueStats,
  // Constants (read-only references)
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
  ADDITIONAL_BLOCKED_CIDRS_V4,
  ADDITIONAL_BLOCKED_CIDRS_V6,
  HOP_BY_HOP_HEADERS,
} from './impl.js';

// Import schema version constants from index.ts (public API)
import {
  SAFE_FETCH_EVENT_SCHEMA_VERSION,
  SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
} from './index.js';

// Import JCS canonicalization helper from evidence-utils
import { jcsCanonicalizeValue } from './evidence-utils.js';

// Import finalizeEvidence from internal module (NOT in main entry)
import { finalizeEvidence } from './internal.js';

// Re-export types needed for testing
export type {
  DnsResolver,
  HttpClient,
  HttpClientTimeouts,
  SafeFetchAuditHook,
  SafeFetchEvent,
  DnsAnswer,
  SafeFetchEvidence,
  SafeFetchEvidenceCore,
  EvidenceLevel,
  RedactedIpInfo,
  RequestAuditContext,
} from './index.js';

// Re-export public utilities that are useful for testing
export {
  canonicalizeEvidence,
  computeEvidenceDigest,
  getAuditQueueStats,
  MAX_PENDING_AUDIT_EVENTS,
  DANGEROUS_PORTS,
  ALLOW_DANGEROUS_PORTS_ACK,
  SAFE_FETCH_ERROR_CODES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_MAX_RESPONSE_BYTES,
  MAX_JWKS_RESPONSE_BYTES,
  RESPONSE_BYTES_MEASUREMENT,
  DEFAULT_TIMEOUTS,
  ALLOW_MIXED_DNS_ACK,
  SAFE_FETCH_EVENT_SCHEMA_VERSION,
  SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
} from './index.js';

/**
 * Internal utilities for testing.
 *
 * These utilities provide access to internal implementation details
 * for testing purposes only. They are NOT stable APIs.
 *
 * @example
 * import { _internals } from '@peac/net-node/testing';
 *
 * // Access internal functions
 * const isPrivate = _internals.isPrivateIP('10.0.0.1');
 */
export const _internals = {
  // Core validation
  isPrivateIP,
  resolveDnsSecure,
  createPinnedAgent,
  // CIDR utilities
  parseCidr,
  matchesAnyCidr,
  validateAllowCidrsAck,
  cidrOverlapsDangerousRanges,
  // URL/hostname utilities
  getRegistrableDomain,
  isRedirectAllowed,
  normalizeHostname,
  sanitizeUrl,
  // Response handling
  readBodyWithLimit,
  attemptWithFallback,
  // Header utilities
  hasHeaderCaseInsensitive,
  stripHopByHopHeaders,
  // Canonical host pipeline
  hasIPv6ZoneId,
  normalizeIPv4MappedIPv6,
  canonicalizeHost,
  // Audit helpers
  emitAuditEvent,
  createRequestAuditContext,
  // Evidence redaction helpers
  hashIpAddress,
  redactIp,
  // JCS canonicalization helpers
  jcsCanonicalizeValue,
  // Audit queue helpers (for testing)
  resetAuditQueueStats,
  // Evidence finalization (from internal.ts - NOT in main entry)
  finalizeEvidence,
  // Constants (read-only references)
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
  ADDITIONAL_BLOCKED_CIDRS_V4,
  ADDITIONAL_BLOCKED_CIDRS_V6,
  HOP_BY_HOP_HEADERS,
  // Schema version constants
  SAFE_FETCH_EVENT_SCHEMA_VERSION,
  SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
} as const;
