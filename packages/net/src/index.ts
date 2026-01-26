/**
 * PEAC Net (Node.js) - SSRF-Safe Network Utilities with DNS Pinning
 *
 * This module provides a reference implementation of network-layer SSRF protection
 * with proper DNS resolution pinning using undici's custom dispatcher.
 *
 * SECURITY NOTES:
 * - String-level URL checks alone are NOT sufficient for SSRF protection
 * - DNS rebinding attacks require connection-time IP pinning
 * - This implementation resolves DNS, validates ALL candidate IPs, and PINS
 *   the chosen IP at the connection layer (not just pre-check)
 *
 * RUNTIME: Node.js only (requires dns module and undici)
 *
 * @since v0.10.x
 * @module @peac/net-node
 */

import { createHash } from 'crypto';
import * as dns from 'dns/promises';
import ipaddr from 'ipaddr.js';
import { getDomain, parse as parseDomain } from 'tldts';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
// Local SSRF types (not from @peac/schema to keep package self-contained)
import {
  validateUrlForSSRF,
  type SSRFPolicy,
  DEFAULT_SSRF_POLICY,
  TRUST_ERROR_CODES,
  ALLOW_DANGEROUS_CIDRS_ACK,
} from './ssrf.js';

// Import finalizeEvidence from internal module (not exported from main entry)
import { finalizeEvidence } from './internal.js';

// Import internal helpers from impl.ts (for internal use only - NOT re-exported)
import {
  isPrivateIP,
  resolveDnsSecure,
  createPinnedAgent,
  parseCidr,
  matchesAnyCidr,
  validateAllowCidrsAck,
  cidrOverlapsDangerousRanges,
  getRegistrableDomain,
  isRedirectAllowed,
  normalizeHostname,
  sanitizeUrl,
  readBodyWithLimit,
  attemptWithFallback,
  hasHeaderCaseInsensitive,
  stripHopByHopHeaders,
  hasIPv6ZoneId,
  normalizeIPv4MappedIPv6,
  canonicalizeHost,
  emitAuditEvent,
  createRequestAuditContext,
  hashIpAddress,
  redactIp,
  resetAuditQueueStats,
  getAuditQueueStats,
  withTimeout,
  BLOCKED_IPV4_RANGES,
  BLOCKED_IPV6_RANGES,
  ADDITIONAL_BLOCKED_CIDRS_V4,
  ADDITIONAL_BLOCKED_CIDRS_V6,
  HOP_BY_HOP_HEADERS,
  HAPPY_EYEBALLS_FIRST_TIMEOUT_MS,
  type RequestAuditContext,
} from './impl.js';

// Import from single source of truth modules
import { SAFE_FETCH_ERROR_CODES } from './codes.js';
import {
  SAFE_FETCH_EVENT_SCHEMA_VERSION,
  SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
  MAX_PENDING_AUDIT_EVENTS,
} from './constants.js';

// Re-export public API items
export { getAuditQueueStats };
export type { RequestAuditContext };
// Re-export error codes and constants
export { SAFE_FETCH_ERROR_CODES };
export {
  SAFE_FETCH_EVENT_SCHEMA_VERSION,
  SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
  MAX_PENDING_AUDIT_EVENTS,
};

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Structured error with code, cause, and warnings
 *
 * NOTE: Error messages are intentionally generic to avoid leaking sensitive
 * information (internal IPs, hostnames). Use `evidence` for audit details.
 */
export interface SafeFetchError {
  error: string;
  code: string;
  cause_code?: string;
  warnings?: string[];
  /** Evidence object for audit trail (always present on error) */
  evidence?: SafeFetchEvidence;
}

/**
 * Result type for safeFetch operations
 */
export type SafeFetchResult<T> =
  | { ok: true; response: Response; data: T; warnings?: string[]; evidence: SafeFetchEvidence }
  | { ok: false } & SafeFetchError;

/**
 * Result type for raw fetch (returns stream with cleanup)
 */
export type SafeFetchRawResult =
  | { ok: true; response: Response; close: () => Promise<void>; warnings?: string[]; evidence: SafeFetchEvidence }
  | { ok: false } & SafeFetchError;

/**
 * DNS resolution result
 */
export interface DnsResolutionResult {
  ok: true;
  addresses: string[];
  selectedAddress: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
}

export interface DnsResolutionError {
  ok: false;
  error: string;
  code: string;
  /** Structured DNS answers for audit trail */
  dns_answers?: DnsAnswer[];
}

/**
 * DNS resolver interface for dependency injection
 * Allows mocking in tests without network calls
 */
export interface DnsResolver {
  /**
   * Resolve a hostname to all available IP addresses
   * @param hostname - The hostname to resolve
   * @returns Array of IP addresses (both IPv4 and IPv6)
   */
  resolveAll(hostname: string): Promise<{ ipv4: string[]; ipv6: string[] }>;
}

/**
 * Phase-specific timeout options for HTTP client (P1.3)
 *
 * These map directly to undici's timeout options for precise control.
 */
export interface HttpClientTimeouts {
  /** Total operation timeout (AbortController) */
  totalMs?: number;
  /** TCP/TLS connect timeout (undici Agent connect.timeout) */
  connectMs?: number;
  /** Time to receive headers after connection (undici headersTimeout) */
  headersMs?: number;
  /** Time to receive body after headers (undici bodyTimeout) */
  bodyMs?: number;
}

/**
 * HTTP client interface for dependency injection
 * Pattern B: returns response + close function for proper lifecycle management
 */
export interface HttpClient {
  /**
   * Fetch a URL with optional pinned IP
   * Returns response and close function to ensure proper agent cleanup
   * @param url - The URL to fetch
   * @param pinnedIp - The IP address to connect to (DNS pinning)
   * @param options - Fetch options with phase-specific timeouts
   */
  fetch(
    url: string,
    pinnedIp: string | null,
    options?: RequestInit & { timeouts?: HttpClientTimeouts; timeoutMs?: number }
  ): Promise<{ response: Response; close: () => Promise<void> }>;
}

/**
 * Redirect policy for cross-host redirects
 */
export type RedirectPolicy =
  | 'none'                      // No redirects allowed
  | 'same-origin'               // Same scheme + host + port
  | 'same-registrable-domain'   // Same eTLD+1 (e.g., api.example.com -> www.example.com)
  | 'allowlist';                // Must match redirectAllowHosts

/**
 * Evidence redaction level for portable receipts
 *
 * - 'public': Safe for external sharing. Hashes IPs, removes raw addresses.
 *   Use this for evidence that may be included in receipts, logs, or telemetry.
 *
 * - 'tenant': Internal correlation with HMAC-SHA256 keyed hashing.
 *   Prevents cross-org linkage while allowing intra-org correlation.
 *   Requires `redactionKey` option to be provided.
 *
 * - 'private': Full details for internal audit. Includes raw IPs and hostnames.
 *   Only use for internal debugging or trusted audit systems.
 *
 * Default is 'public' for defense-in-depth (evidence may leak to external systems).
 *
 * @since v0.10.x
 */
export type EvidenceLevel = 'public' | 'tenant' | 'private';

/**
 * Redacted IP information for public evidence
 *
 * Raw IP addresses are replaced with family + SHA-256 hash.
 * This allows correlation without exposing internal topology.
 *
 * For 'tenant' level, uses HMAC-SHA256 with tenant key to prevent
 * cross-org correlation via rainbow tables.
 */
export interface RedactedIpInfo {
  /** Address family (4 or 6) */
  family: 4 | 6;
  /** SHA-256 or HMAC-SHA256 hash of the IP address (lowercase hex, 0x prefixed) */
  hash: string;
  /** Key ID used for HMAC (only present in 'tenant' mode) */
  key_id?: string;
}

/**
 * Acknowledgment string for allowing mixed public/private DNS resolution
 */
export const ALLOW_MIXED_DNS_ACK = 'I_UNDERSTAND_MIXED_DNS_SECURITY_RISKS' as const;

// -----------------------------------------------------------------------------
// P1.1: Vendor-neutral Audit Hook (Protocol-Grade)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// P1.2: JCS Canonicalization + SHA-256 Digest
// -----------------------------------------------------------------------------

/**
 * Canonicalize a JSON value per RFC 8785 (JSON Canonicalization Scheme)
 *
 * This ensures deterministic serialization for cross-implementation parity:
 * - Object keys sorted lexicographically (Unicode code points)
 * - No whitespace between tokens
 * - Numbers serialized per ES2015
 * - Strings with minimal escaping
 *
 * @param value - Any JSON-serializable value
 * @returns Canonical JSON string
 * @internal
 */
function jcsCanonicalizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // Handle special cases per ES2015 spec
    if (Object.is(value, -0)) return '0';
    if (!Number.isFinite(value)) {
      throw new Error('JCS does not support Infinity or NaN');
    }
    return String(value);
  }
  if (typeof value === 'string') {
    // Use JSON.stringify for proper escaping
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const elements = value.map(jcsCanonicalizeValue);
    return '[' + elements.join(',') + ']';
  }
  if (typeof value === 'object' && value !== null) {
    // Sort keys lexicographically (Unicode code point order)
    const keys = Object.keys(value).sort();
    const pairs = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + jcsCanonicalizeValue((value as Record<string, unknown>)[k]));
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

/**
 * Evidence without digest fields (for computing the digest)
 *
 * The digest is computed over evidence with digest fields omitted
 * to avoid self-referential circularity.
 */
export type SafeFetchEvidenceCore = Omit<
  SafeFetchEvidence,
  'evidence_digest' | 'evidence_alg' | 'canonicalization'
>;

/**
 * Canonicalize evidence per RFC 8785 (JCS)
 *
 * Returns the canonical JSON string representation of the evidence object.
 * This is deterministic across implementations and can be used for:
 * - Computing digests for signing
 * - Cross-implementation verification
 * - Deduplication
 *
 * IMPORTANT: For digest computation, pass evidence WITHOUT digest fields
 * to avoid self-referential circularity.
 *
 * @param evidence - SafeFetchEvidence or SafeFetchEvidenceCore object
 * @returns Canonical JSON string
 */
export function canonicalizeEvidence(
  evidence: SafeFetchEvidence | SafeFetchEvidenceCore
): string {
  return jcsCanonicalizeValue(evidence);
}

/**
 * Compute SHA-256 digest of evidence using JCS canonicalization
 *
 * Returns a 0x-prefixed lowercase hex string, consistent with other
 * PEAC cryptographic identifiers (EAS anchors, IP hashes).
 *
 * Self-omission rule: If the evidence includes digest fields, they are
 * stripped before computing the digest to avoid circularity.
 *
 * @param evidence - SafeFetchEvidence or SafeFetchEvidenceCore object
 * @returns 0x-prefixed SHA-256 hex digest
 */
export function computeEvidenceDigest(
  evidence: SafeFetchEvidence | SafeFetchEvidenceCore
): string {
  // Strip digest fields if present (self-omission rule)
  const { evidence_digest, evidence_alg, canonicalization, ...core } =
    evidence as SafeFetchEvidence;
  const canonical = canonicalizeEvidence(core);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `0x${hash}`;
}

// NOTE: finalizeEvidence is imported from ./internal.js (not defined here)
// This keeps it out of the main entry's type definitions.

/**
 * Event types emitted by safeFetch for audit logging
 */
export type SafeFetchEventType =
  | 'dns_start'
  | 'dns_success'
  | 'dns_blocked'
  | 'dns_error'
  | 'connect_start'
  | 'connect_success'
  | 'connect_error'
  | 'request_start'
  | 'response_headers'
  | 'response_body_start'
  | 'response_body_complete'
  | 'redirect'
  | 'error'
  | 'audit_overflow'
  | 'audit_hook_error';

/**
 * Structured DNS answer for audit-clean logging
 *
 * Each answer includes the IP, address family, and blocked reason (if any).
 * This allows downstream verifiers to replay "why blocked/allowed" decisions.
 */
export interface DnsAnswer {
  /** Resolved IP address */
  ip: string;
  /** Address family (4 or 6) */
  family: 4 | 6;
  /** If blocked, the reason code; undefined if allowed */
  blocked_reason?: string;
}

/**
 * Policy decision for audit trail
 */
export type PolicyDecision = 'allow' | 'block';

/**
 * Audit event with timing and metadata
 *
 * This is a vendor-neutral structure that can be adapted to any logging system.
 * Events are emitted at key points in the fetch lifecycle.
 *
 * IMPORTANT: This schema is versioned via `schema_version` for forward compatibility.
 * @see SAFE_FETCH_EVENT_SCHEMA_VERSION
 */
export interface SafeFetchEvent {
  /** Schema version for forward compatibility */
  schema_version: typeof SAFE_FETCH_EVENT_SCHEMA_VERSION;
  /** Event type */
  type: SafeFetchEventType;
  /** Timestamp (Date.now()) */
  timestamp: number;
  /** Original request URL (sanitized - no credentials) */
  url: string;
  /** Resolved hostname (after canonicalization) */
  hostname?: string;
  /** Selected IP address (only on success events) */
  selected_ip?: string;
  /** Error code if applicable */
  code?: string;
  /** Human-readable message (generic, non-sensitive) */
  message?: string;
  /** Policy decision (allow/block) for DNS events */
  policy_decision?: PolicyDecision;
  /** Additional metadata (vendor-neutral, may contain sensitive debug info) */
  meta?: Record<string, unknown>;
}

/**
 * Audit hook callback type
 *
 * HOOK CONTRACT (for reliable integration):
 *
 * - Delivery: Asynchronous via queueMicrotask (non-blocking to fetch path)
 * - Ordering: FIFO within a single request (events arrive in fetch order)
 * - Guarantees: At-most-once delivery (events may be dropped under load)
 * - Exceptions: MUST NOT throw (exceptions are swallowed silently)
 * - Side effects: MUST NOT modify request/response or call safeFetch
 *
 * Special events:
 * - `audit_overflow`: Emitted SYNCHRONOUSLY when queue is full (rate-limited 1/sec)
 *   This event bypasses the queue to ensure observability of drops.
 *
 * For enterprise reliability, consume events idempotently and monitor
 * `audit_overflow` events as a signal of capacity issues.
 */
export type SafeFetchAuditHook = (event: SafeFetchEvent) => void;

// -----------------------------------------------------------------------------
// Evidence Object (PEAC-Ready Portable Proof)
// -----------------------------------------------------------------------------

/**
 * Evidence object returned by safeFetch for PEAC-ready receipts
 *
 * This is a portable, signed-ready artifact that captures:
 * - Request URL (normalized, no credentials)
 * - Canonical host processing
 * - DNS resolution decisions
 * - Redirect chain (if any)
 * - Timing summary
 * - Budget enforcement
 * - Final decision code
 *
 * Evidence is redacted based on `evidence_level`:
 * - 'public': Raw IPs replaced with family + SHA-256 hash
 * - 'private': Full details including raw IPs
 *
 * Designed for multi-agent workflow verification and dispute resolution.
 */
export interface SafeFetchEvidence {
  /** Schema version for forward compatibility (evidence-specific) */
  schema_version: typeof SAFE_FETCH_EVIDENCE_SCHEMA_VERSION;
  /**
   * Evidence redaction level
   * - 'public': Safe for external sharing (default)
   * - 'tenant': Internal correlation with HMAC (prevents cross-org linkage)
   * - 'private': Full details for internal audit
   */
  evidence_level: EvidenceLevel;

  // --- Digest fields (stable identifier for indexing/correlation) ---

  /**
   * SHA-256 digest of canonical evidence (0x-prefixed hex)
   * Computed over evidence with this field omitted (self-referential exclusion)
   */
  evidence_digest: string;
  /**
   * Hash algorithm used for digest
   * @default 'sha-256'
   */
  evidence_alg: 'sha-256';
  /**
   * Canonicalization scheme used before hashing
   * @default 'RFC8785-JCS'
   */
  canonicalization: 'RFC8785-JCS';
  /** Request timestamp (start of fetch) */
  request_timestamp: number;
  /** Response timestamp (headers received) */
  response_timestamp?: number;
  /** Normalized request URL (no credentials) */
  request_url: string;
  /** Canonical hostname after processing */
  canonical_host: string;
  /** Whether host was an IP literal */
  is_ip_literal: boolean;

  // --- Public evidence fields (always present when applicable) ---

  /**
   * Selected IP info (public evidence - always present on success)
   * Contains family and SHA-256 hash of the selected IP
   */
  selected_ip_info?: RedactedIpInfo;
  /**
   * DNS answer summary (public evidence)
   * Count of answers by family, without raw IPs
   */
  dns_answer_count?: { ipv4: number; ipv6: number };

  // --- Private evidence fields (only in 'private' level) ---

  /**
   * DNS answers with per-IP decisions (private evidence only)
   * Only populated when evidence_level is 'private'
   */
  dns_answers?: DnsAnswer[];
  /**
   * Raw selected IP for connection (private evidence only)
   * Only populated when evidence_level is 'private'
   */
  selected_ip?: string;

  // --- Common fields ---

  /** Policy decision */
  policy_decision: PolicyDecision;
  /** Final decision code */
  decision_code: string;
  /** Redirect chain (URLs) */
  redirect_chain?: string[];
  /** Response status code */
  response_status?: number;
  /** Actual response bytes received */
  response_bytes?: number;
  /** Max response bytes budget */
  max_response_bytes: number;
  /** Total elapsed time in milliseconds */
  elapsed_ms?: number;
  /** Dropped headers (security enforcement) */
  dropped_headers?: string[];

  // --- Audit observability fields ---

  /**
   * Audit queue statistics at time of evidence creation (per-request)
   *
   * Provides visibility into audit event processing health for THIS request.
   * All counters are request-scoped - they reset for each safeFetch call.
   * If `dropped > 0`, some events were lost due to queue overflow.
   * This is a signal that evidence quality may be degraded.
   */
  audit_stats?: {
    /** Number of audit events pending at evidence creation */
    pending: number;
    /** Total number of dropped audit events for this request */
    dropped: number;
    /** Maximum allowed pending events */
    max_pending: number;
    /** Number of hook errors that occurred during this request */
    hook_errors: number;
    /** Number of hook errors suppressed by rate limiting for this request */
    hook_suppressed: number;
  };

  /**
   * Indicates audit data was truncated due to overflow
   *
   * NORMATIVE PRESENCE SEMANTICS:
   * - Present and `true`: Evidence is incomplete, audit events were dropped
   * - Absent (undefined): Evidence is complete, no truncation occurred
   *
   * Producers MUST omit this field when no truncation occurred.
   * Producers MUST NOT emit `audit_truncated: false`.
   *
   * This field uses presence semantics to ensure digest compatibility:
   * `{ ...core }` and `{ ...core, audit_truncated: false }` would produce
   * different digests for logically identical evidence. By requiring omission
   * when false, we guarantee cross-implementation digest parity.
   *
   * Set to `true` when `audit_stats.dropped > 0`.
   */
  audit_truncated?: true;
}

// -----------------------------------------------------------------------------
// P1.2: Timeout Configuration
// -----------------------------------------------------------------------------

/**
 * Granular timeout configuration for different phases
 *
 * All values are in milliseconds. If not specified, defaults apply.
 */
export interface TimeoutConfig {
  /**
   * Total request timeout (overall limit)
   * @default 30000 (30 seconds)
   */
  totalMs?: number;
  /**
   * DNS resolution timeout
   * @default 5000 (5 seconds)
   */
  dnsMs?: number;
  /**
   * TCP/TLS connection timeout
   * @default 10000 (10 seconds)
   */
  connectMs?: number;
  /**
   * Time to receive response headers
   * @default 15000 (15 seconds)
   */
  headersMs?: number;
  /**
   * Time to receive response body (after headers)
   * @default 30000 (30 seconds)
   */
  bodyMs?: number;
}

/**
 * Default timeout values
 */
export const DEFAULT_TIMEOUTS: Required<TimeoutConfig> = {
  totalMs: 30000,
  dnsMs: 5000,
  connectMs: 10000,
  headersMs: 15000,
  bodyMs: 30000,
} as const;

/**
 * Options for safeFetch
 */
export interface SafeFetchOptions extends Omit<RequestInit, 'signal'> {
  /**
   * SSRF policy configuration
   * @default DEFAULT_SSRF_POLICY
   */
  ssrfPolicy?: SSRFPolicy;

  /**
   * Request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeoutMs?: number;

  /**
   * Maximum number of redirects to follow
   * Set to 0 to disable redirects
   * @default 5
   */
  maxRedirects?: number;

  /**
   * Redirect policy for handling cross-host redirects
   * @default 'same-origin'
   */
  redirectPolicy?: RedirectPolicy;

  /**
   * Allowed hosts for redirects when redirectPolicy is 'allowlist'
   * Also used for 'same-registrable-domain' as additional allowed hosts
   */
  redirectAllowHosts?: string[];

  /**
   * @deprecated Use redirectPolicy instead
   * Allow redirects to different hosts
   */
  allowCrossHostRedirects?: boolean;

  /**
   * Allowed HTTP methods (SSRF side-effect prevention)
   * @default ['GET', 'HEAD']
   */
  allowedMethods?: string[];

  /**
   * Maximum response body size in bytes (DoS protection)
   * @default 2097152 (2 MB)
   */
  maxResponseBytes?: number;

  /**
   * Disable Accept-Encoding: identity default.
   *
   * By default, we send Accept-Encoding: identity to prevent decompression bombs.
   * Setting this to true allows compressed responses (gzip, deflate, br).
   *
   * WARNING: Only set this if you trust the server AND have streaming
   * decompression with size limits in place.
   *
   * @default false
   */
  allowCompression?: boolean;

  /**
   * Allow DNS resolution that returns BOTH public and private IPs.
   *
   * By default, we REJECT requests where ANY resolved IP is private,
   * even if there are also public IPs. This prevents attackers from
   * hiding a private IP alongside public ones.
   *
   * In some corporate environments, split DNS legitimately returns
   * both internal and external IPs. This escape hatch allows such
   * configurations, but requires explicit acknowledgment.
   *
   * SECURITY WARNING: This weakens SSRF protection. Only use if:
   * 1. You control the DNS infrastructure
   * 2. You understand the risks of mixed DNS responses
   * 3. You have other mitigations in place (network segmentation, etc.)
   *
   * @default false
   */
  allowMixedPublicAndPrivateDns?: boolean;

  /**
   * Required acknowledgment for allowMixedPublicAndPrivateDns.
   * Set to ALLOW_MIXED_DNS_ACK ('I_UNDERSTAND_MIXED_DNS_SECURITY_RISKS').
   */
  ack_allow_mixed_dns?: typeof ALLOW_MIXED_DNS_ACK;

  /**
   * Allow connections to dangerous ports (admin, databases, service mesh).
   *
   * By default, we BLOCK connections to ports in DANGEROUS_PORTS set
   * (SSH, databases, container orchestration, etc.) even on public IPs.
   * This prevents SSRF attacks targeting internal services on non-standard ports.
   *
   * SECURITY WARNING: This weakens SSRF protection. Only use if:
   * 1. You specifically need to connect to services on these ports
   * 2. You understand the risks of allowing these connections
   * 3. You have network-level controls in place
   *
   * @default false
   */
  allowDangerousPorts?: boolean;

  /**
   * Required acknowledgment for allowDangerousPorts.
   * Set to ALLOW_DANGEROUS_PORTS_ACK ('I_UNDERSTAND_DANGEROUS_PORTS_RISK').
   */
  ack_allow_dangerous_ports?: typeof ALLOW_DANGEROUS_PORTS_ACK;

  /**
   * Granular timeout configuration for different phases.
   * If provided, overrides timeoutMs for specific phases.
   * @see TimeoutConfig
   */
  timeouts?: TimeoutConfig;

  /**
   * Audit hook for observing fetch lifecycle events.
   *
   * Called at key points (DNS, connect, request, response, error).
   * Useful for logging, metrics, and debugging.
   *
   * MUST NOT throw or modify request/response.
   * Hooks are invoked via queueMicrotask for performance isolation.
   * @see SafeFetchAuditHook
   */
  onEvent?: SafeFetchAuditHook;

  /**
   * Custom sanitizer for hook error messages.
   *
   * By default, error messages are sanitized to:
   * - Truncate to 200 characters
   * - Redact Bearer tokens, passwords, keys, secrets
   *
   * Use this option to provide a custom sanitizer or disable sanitization:
   * - Pass a function to customize: `(msg: string) => sanitizedMsg`
   * - Pass `'off'` to disable sanitization entirely (NOT RECOMMENDED in production)
   *
   * @default Built-in sanitizer (truncate + redact secrets)
   */
  sanitizeHookError?: ((message: string) => string) | 'off';

  /**
   * Enable debug mode to include sensitive details in evidence and events.
   *
   * When false (default), error messages and evidence are generic to avoid
   * leaking internal IPs or hostnames through logs/telemetry.
   *
   * When true:
   * - Evidence includes detailed `dns_answers` with per-IP decisions
   * - Event metadata includes blocked IPs and addresses
   *
   * WARNING: Only enable in trusted environments (local dev, internal logging).
   * @default false
   * @deprecated Use evidenceLevel: 'private' instead for evidence, keep debug for events
   */
  debug?: boolean;

  /**
   * Evidence redaction level for portable receipts.
   *
   * - 'public' (default): Raw IPs replaced with family + SHA-256 hash.
   *   Safe for including in receipts, logs, or external telemetry.
   *   Note: SHA-256 of IPv4 is rainbow-table vulnerable (only 2^32 inputs).
   *
   * - 'tenant': HMAC-SHA256 with tenant-specific key. Prevents cross-org
   *   correlation via rainbow tables while allowing intra-org correlation.
   *   Requires `redactionKey` and `redactionKeyId` options.
   *
   * - 'private': Full details including raw IPs and DNS answers.
   *   Only use for internal audit systems you control.
   *
   * Defense-in-depth: default 'public' ensures evidence is safe even
   * if accidentally exposed through logs or telemetry pipelines.
   *
   * @default 'public'
   * @since v0.10.x
   */
  evidenceLevel?: EvidenceLevel;

  /**
   * Tenant-specific key for HMAC-based IP hashing (tenant mode only).
   *
   * Must be at least 32 bytes for security. Used with HMAC-SHA256 to
   * prevent cross-tenant correlation via rainbow tables.
   *
   * Required when evidenceLevel is 'tenant'.
   *
   * @since v0.10.x
   */
  redactionKey?: Uint8Array;

  /**
   * Key identifier for tenant mode redaction.
   *
   * Included in evidence to identify which key was used for hashing.
   * Allows key rotation while maintaining audit trails.
   *
   * Required when evidenceLevel is 'tenant'.
   *
   * @since v0.10.x
   */
  redactionKeyId?: string;

  /**
   * Custom DNS resolver for dependency injection (testing)
   * @internal
   */
  _dnsResolver?: DnsResolver;

  /**
   * Custom HTTP client for dependency injection (testing)
   * @internal
   */
  _httpClient?: HttpClient;
}

/**
 * Internal options for tracking redirect state
 */
interface InternalFetchOptions extends SafeFetchOptions {
  _redirectCount?: number;
  _originalHost?: string;
  _originalOrigin?: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Default timeout for fetch requests (30 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default maximum redirects
 */
export const DEFAULT_MAX_REDIRECTS = 5;

/**
 * Default allowed HTTP methods (GET/HEAD only for SSRF safety)
 */
export const DEFAULT_ALLOWED_METHODS = ['GET', 'HEAD'];

/**
 * Default maximum response size (2 MB)
 *
 * COMPRESSION SEMANTICS (P0.4 - Protocol-Grade Evidence):
 *
 * This limit measures DECODED bytes (after decompression), NOT wire bytes.
 * The limit applies to what `response.body.getReader().read()` returns.
 *
 * By default, we request `Accept-Encoding: identity` to prevent compression.
 * This means:
 * - Wire bytes === Decoded bytes (no compression)
 * - Content-Length matches actual body size
 * - No decompression bomb risk
 *
 * If `allowCompression: true`, compression is allowed, and:
 * - Wire bytes may be smaller than decoded bytes
 * - Content-Length reflects compressed size (if set)
 * - We measure DECODED bytes (after browser/runtime decompresses)
 * - Decompression bombs are possible (1KB compressed -> 1GB decoded)
 *
 * WARNING: Only use `allowCompression: true` if you trust the server AND have
 * additional decoded size limits in place.
 *
 * For evidence purposes, `response_bytes` in SafeFetchEvidence reflects
 * decoded bytes (what we actually read), not wire bytes.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Whether maxResponseBytes measures wire or decoded bytes.
 * Always 'decoded' - we measure after potential decompression.
 */
export const RESPONSE_BYTES_MEASUREMENT = 'decoded' as const;

/**
 * Maximum response size for JWKS/OIDC endpoints (512 KB)
 */
export const MAX_JWKS_RESPONSE_BYTES = 512 * 1024;

/**
 * Dangerous ports that are ALWAYS blocked regardless of configuration.
 *
 * These ports commonly host:
 * - SSH (22), SMTP (25), DNS (53), FTP (21)
 * - Database services (3306 MySQL, 5432 PostgreSQL, 6379 Redis, 27017 MongoDB)
 * - Kubernetes (6443, 10250), Envoy (15000), Prometheus (9090)
 * - Internal admin panels, debug ports
 *
 * Blocking these prevents SSRF to internal services even on attacker-controlled hosts.
 * To allow these ports, you MUST provide explicit acknowledgment.
 */
export const DANGEROUS_PORTS: ReadonlySet<number> = new Set([
  // Remote access
  21,    // FTP control
  22,    // SSH
  23,    // Telnet
  25,    // SMTP
  53,    // DNS
  110,   // POP3
  143,   // IMAP
  445,   // SMB
  513,   // rlogin
  514,   // rsh/syslog
  587,   // SMTP submission
  // Databases
  1433,  // MSSQL
  1521,  // Oracle
  3306,  // MySQL
  5432,  // PostgreSQL
  5984,  // CouchDB
  6379,  // Redis
  9042,  // Cassandra
  27017, // MongoDB
  // Container/orchestration
  2375,  // Docker daemon (unencrypted)
  2376,  // Docker daemon (TLS)
  2379,  // etcd client
  2380,  // etcd peer
  6443,  // Kubernetes API
  10250, // Kubelet
  10255, // Kubelet read-only
  // Service mesh/proxy
  9090,  // Prometheus
  15000, // Envoy admin
  15001, // Istio proxy
  15004, // Istio debug
]);

/**
 * Acknowledgment string for allowing dangerous ports
 */
export const ALLOW_DANGEROUS_PORTS_ACK = 'I_UNDERSTAND_DANGEROUS_PORTS_RISK' as const;

// Internal constants are now imported from impl.ts

// Internal helper functions are now imported from impl.ts


// -----------------------------------------------------------------------------
// Default Implementations
// -----------------------------------------------------------------------------

/**
 * Default DNS resolver using Node.js dns.promises module
 * Resolves both A (IPv4) and AAAA (IPv6) records separately for Happy Eyeballs
 */
export const defaultDnsResolver: DnsResolver = {
  async resolveAll(hostname: string): Promise<{ ipv4: string[]; ipv6: string[] }> {
    const ipv4: string[] = [];
    const ipv6: string[] = [];

    // Try to get all A records (IPv4)
    try {
      const ipv4Addresses = await dns.resolve4(hostname);
      ipv4.push(...ipv4Addresses);
    } catch {
      // IPv4 resolution failed, continue with IPv6
    }

    // Try to get all AAAA records (IPv6)
    try {
      const ipv6Addresses = await dns.resolve6(hostname);
      ipv6.push(...ipv6Addresses);
    } catch {
      // IPv6 resolution failed
    }

    // If both failed, fall back to dns.lookup for /etc/hosts entries
    if (ipv4.length === 0 && ipv6.length === 0) {
      const result = await dns.lookup(hostname, { all: true });
      if (Array.isArray(result)) {
        for (const r of result) {
          if (r.family === 4) {
            ipv4.push(r.address);
          } else if (r.family === 6) {
            ipv6.push(r.address);
          }
        }
      }
    }

    return { ipv4, ipv6 };
  },
};


/**
 * Default HTTP client using undici with DNS pinning
 * Returns close function for proper agent lifecycle management
 * P1.3: Supports phase-specific timeouts via undici options
 */
export const defaultHttpClient: HttpClient = {
  async fetch(
    url: string,
    pinnedIp: string | null,
    options?: RequestInit & { timeouts?: HttpClientTimeouts; timeoutMs?: number }
  ): Promise<{ response: Response; close: () => Promise<void> }> {
    const parsedUrl = new URL(url);

    // P1.3: Extract phase-specific timeouts
    const timeouts = options?.timeouts;
    const totalMs = timeouts?.totalMs ?? options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const connectMs = timeouts?.connectMs ?? DEFAULT_TIMEOUTS.connectMs;
    const headersMs = timeouts?.headersMs ?? DEFAULT_TIMEOUTS.headersMs;
    const bodyMs = timeouts?.bodyMs ?? DEFAULT_TIMEOUTS.bodyMs;

    // Create abort controller for total timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), totalMs);

    let agent: Agent | null = null;

    try {
      if (pinnedIp) {
        // Use pinned agent for DNS rebinding protection
        // P1.3: Pass connect timeout to agent
        agent = createPinnedAgent(pinnedIp, parsedUrl.hostname, {
          connectTimeoutMs: connectMs,
        });

        // P1.3: Pass phase-specific timeouts to undici
        const response = await undiciFetch(url, {
          ...options,
          signal: controller.signal,
          dispatcher: agent as Dispatcher,
          redirect: 'manual', // Handle redirects manually
          // undici-specific timeout options
          headersTimeout: headersMs,
          bodyTimeout: bodyMs,
        } as RequestInit);

        clearTimeout(timeoutId);

        // Return response and close function
        // IMPORTANT: Agent must be closed AFTER body is consumed
        return {
          response: response as unknown as Response,
          close: async () => {
            if (agent) {
              await agent.close();
            }
          },
        };
      } else {
        // No pinning needed (IP literal already validated)
        // P1.3: Pass phase-specific timeouts to undici
        const response = await undiciFetch(url, {
          ...options,
          signal: controller.signal,
          redirect: 'manual',
          headersTimeout: headersMs,
          bodyTimeout: bodyMs,
        } as RequestInit);

        clearTimeout(timeoutId);

        return {
          response: response as unknown as Response,
          close: async () => {
            // No agent to close
          },
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      // Clean up agent on error
      if (agent) {
        await agent.close();
      }
      throw err;
    }
  },
};


// -----------------------------------------------------------------------------
// Main API
// -----------------------------------------------------------------------------

/**
 * SSRF-safe raw fetch with proper DNS resolution pinning
 * Returns response stream with close function for proper lifecycle management
 *
 * Use this when you need to process the response stream directly.
 * IMPORTANT: You MUST call the close() function after consuming the response.
 *
 * Security features:
 * - DNS resolution pinning (prevents rebinding attacks)
 * - Private IP blocking (RFC 6890 compliant)
 * - Host header enforcement (prevents SSRF via Host manipulation)
 * - Hop-by-hop header stripping (RFC 7230)
 * - Response size enforcement
 * - Redirect chain validation
 *
 * Returns an evidence object for PEAC-ready receipts and audit trails.
 */
export async function safeFetchRaw(
  url: string,
  options?: SafeFetchOptions
): Promise<SafeFetchRawResult> {
  // Create request-scoped audit context for per-request counters
  const auditCtx = createRequestAuditContext();

  const requestTimestamp = Date.now();
  const internalOptions: InternalFetchOptions = {
    ...options,
    _redirectCount: (options as InternalFetchOptions)?._redirectCount ?? 0,
    _originalHost: (options as InternalFetchOptions)?._originalHost,
    _originalOrigin: (options as InternalFetchOptions)?._originalOrigin,
  };

  // P1.3: Extract phase-specific timeouts from TimeoutConfig
  // If timeouts option is provided, it overrides the legacy timeoutMs option
  const phaseTimeouts = options?.timeouts ?? {
    totalMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    dnsMs: DEFAULT_TIMEOUTS.dnsMs,
    connectMs: DEFAULT_TIMEOUTS.connectMs,
    headersMs: DEFAULT_TIMEOUTS.headersMs,
    bodyMs: DEFAULT_TIMEOUTS.bodyMs,
  };
  const totalTimeoutMs = phaseTimeouts.totalMs ?? DEFAULT_TIMEOUT_MS;
  const dnsTimeoutMs = phaseTimeouts.dnsMs ?? DEFAULT_TIMEOUTS.dnsMs;
  // connectMs, headersMs, bodyMs are passed to httpClient

  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxResponseBytes = options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const ssrfPolicy = options?.ssrfPolicy ?? DEFAULT_SSRF_POLICY;
  const allowedMethods = options?.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
  const debug = options?.debug ?? false;
  // P0.3: Evidence level (default 'public' for defense-in-depth)
  const evidenceLevel = options?.evidenceLevel ?? 'public';
  const isPrivateEvidence = evidenceLevel === 'private';
  const warnings: string[] = [];
  const droppedHeaders: string[] = [];

  // Validate tenant mode configuration (fail-fast)
  if (evidenceLevel === 'tenant') {
    if (!options?.redactionKey || options.redactionKey.length < 32) {
      // Build minimal error evidence before we have hostname info
      const errorCore: SafeFetchEvidenceCore = {
        schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
        evidence_level: 'public', // Fallback to public for error evidence
        request_timestamp: requestTimestamp,
        request_url: sanitizeUrl(url),
        canonical_host: '[unknown]',
        is_ip_literal: false,
        policy_decision: 'block',
        decision_code: SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING,
        max_response_bytes: options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      };
      return {
        ok: false,
        error: 'Tenant mode requires redactionKey (>= 32 bytes)',
        code: SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING,
        evidence: finalizeEvidence(errorCore, auditCtx),
      };
    }
    if (!options?.redactionKeyId) {
      const errorCore: SafeFetchEvidenceCore = {
        schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
        evidence_level: 'public',
        request_timestamp: requestTimestamp,
        request_url: sanitizeUrl(url),
        canonical_host: '[unknown]',
        is_ip_literal: false,
        policy_decision: 'block',
        decision_code: SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING,
        max_response_bytes: options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      };
      return {
        ok: false,
        error: 'Tenant mode requires redactionKeyId for key rotation audit',
        code: SAFE_FETCH_ERROR_CODES.E_TENANT_KEY_MISSING,
        evidence: finalizeEvidence(errorCore, auditCtx),
      };
    }
  }

  // Sanitize URL for logging (remove credentials)
  const sanitizedUrl = sanitizeUrl(url);

  // Handle deprecated allowCrossHostRedirects
  let redirectPolicy = options?.redirectPolicy ?? 'same-origin';
  if (options?.allowCrossHostRedirects && !options?.redirectPolicy) {
    redirectPolicy = 'same-registrable-domain';
    warnings.push('allowCrossHostRedirects is deprecated, use redirectPolicy instead');
  }

  // Use injected dependencies or defaults
  const dnsResolver = options?._dnsResolver ?? defaultDnsResolver;
  const httpClient = options?._httpClient ?? defaultHttpClient;

  // Helper to build error evidence (partial, before hostname resolution)
  // P0.3: Respects evidenceLevel for redaction
  const buildErrorEvidence = (
    code: string,
    canonicalHost = '[unknown]',
    isIpLiteral = false,
    dnsAnswers?: DnsAnswer[],
    selectedIp?: string
  ): SafeFetchEvidence => {
    // Build redaction options for tenant mode
    const redactOpts = evidenceLevel === 'tenant' && options?.redactionKey
      ? { key: options.redactionKey, keyId: options?.redactionKeyId }
      : undefined;

    // Build base evidence (without digest - will be added by finalizeEvidence)
    const core: SafeFetchEvidenceCore = {
      schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
      evidence_level: evidenceLevel,
      request_timestamp: requestTimestamp,
      request_url: sanitizedUrl,
      canonical_host: canonicalHost,
      is_ip_literal: isIpLiteral,
      policy_decision: 'block',
      decision_code: code,
      max_response_bytes: maxResponseBytes,
      dropped_headers: droppedHeaders.length > 0 ? droppedHeaders : undefined,
    };

    // Add IP-related fields based on evidence level
    if (selectedIp) {
      if (isPrivateEvidence) {
        core.selected_ip = selectedIp;
      } else {
        core.selected_ip_info = redactIp(selectedIp, redactOpts);
      }
    }

    // Add DNS answers based on evidence level
    if (dnsAnswers && dnsAnswers.length > 0) {
      if (isPrivateEvidence) {
        core.dns_answers = dnsAnswers;
      } else {
        // Public/tenant: only include counts
        const ipv4Count = dnsAnswers.filter(a => a.family === 4).length;
        const ipv6Count = dnsAnswers.filter(a => a.family === 6).length;
        core.dns_answer_count = { ipv4: ipv4Count, ipv6: ipv6Count };
      }
    }

    // Finalize with digest (pass auditCtx for request-scoped counters)
    return finalizeEvidence(core, auditCtx);
  };

  // Step 0: Validate HTTP method (SSRF side-effect prevention)
  const method = (options?.method ?? 'GET').toUpperCase();
  if (!allowedMethods.map((m) => m.toUpperCase()).includes(method)) {
    return {
      ok: false,
      error: `HTTP method '${method}' not allowed`,
      code: SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED,
      evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_METHOD_NOT_ALLOWED),
    };
  }

  // Step 1: Validate allowCidrs acknowledgment at DNS-time
  const ackValidation = validateAllowCidrsAck(ssrfPolicy);
  if (!ackValidation.valid) {
    return {
      ok: false,
      error: 'SSRF policy configuration error',
      code: SAFE_FETCH_ERROR_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED,
      evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_ALLOWCIDRS_ACK_REQUIRED),
    };
  }

  // Validate allowMixedPublicAndPrivateDns acknowledgment
  const allowMixedDns = options?.allowMixedPublicAndPrivateDns ?? false;
  if (allowMixedDns && options?.ack_allow_mixed_dns !== ALLOW_MIXED_DNS_ACK) {
    return {
      ok: false,
      error: 'Mixed DNS requires explicit acknowledgment',
      code: SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_ACK_MISSING,
      evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_ACK_MISSING),
    };
  }

  // Step 2: String-level URL validation
  const urlCheck = validateUrlForSSRF(url, ssrfPolicy);
  if (!urlCheck.ok) {
    return {
      ok: false,
      error: 'URL rejected by SSRF policy',
      code: SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED,
      cause_code: urlCheck.code,
      evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_URL_REJECTED),
    };
  }

  const parsedUrl = urlCheck.value;
  const rawHostname = parsedUrl.hostname;

  // Step 2.1: Dangerous port validation
  // Get port number (default 443 for https, 80 for http)
  const portStr = parsedUrl.port;
  const effectivePort = portStr
    ? parseInt(portStr, 10)
    : parsedUrl.protocol === 'https:' ? 443 : 80;

  // Check if port is in dangerous ports list
  if (DANGEROUS_PORTS.has(effectivePort)) {
    const allowDangerous = options?.allowDangerousPorts ?? false;
    if (allowDangerous && options?.ack_allow_dangerous_ports !== ALLOW_DANGEROUS_PORTS_ACK) {
      return {
        ok: false,
        error: 'Dangerous port requires explicit acknowledgment',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING,
        evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT_ACK_MISSING),
      };
    }
    if (!allowDangerous) {
      return {
        ok: false,
        error: 'Port blocked by security policy',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT,
        evidence: buildErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_DANGEROUS_PORT),
      };
    }
    // User explicitly acknowledged - allow through
    warnings.push(`Dangerous port ${effectivePort} allowed via explicit acknowledgment`);
  }

  // Step 2.5: Canonical host validation (zone IDs, IDN, IPv4-mapped IPv6)
  const hostResult = canonicalizeHost(rawHostname);
  if (!hostResult.ok) {
    return {
      ...hostResult,
      evidence: buildErrorEvidence(hostResult.code),
    };
  }
  const hostname = hostResult.hostname;

  // Track original host/origin for redirect validation
  if (!internalOptions._originalHost) {
    internalOptions._originalHost = hostname;
    internalOptions._originalOrigin = parsedUrl.origin;
  }

  // Get the audit hook for event emission and optional sanitizer
  const onEvent = options?.onEvent;
  const hookSanitizer = options?.sanitizeHookError;

  // Track DNS answers for evidence
  let dnsAnswers: DnsAnswer[] | undefined;

  // Step 3: DNS resolution with validation and pinning
  let pinnedIp: string | null = null;
  let dnsResult: DnsResolutionResult | null = null;

  if (hostResult.isIP) {
    // URL contains IP literal (may have been normalized from IPv4-mapped IPv6)
    // No DNS resolution needed, but we still validate the IP
    const isBlocked = isPrivateIP(hostname, ssrfPolicy);
    dnsAnswers = [{
      ip: hostname,
      family: hostname.includes(':') ? 6 : 4,
      blocked_reason: isBlocked ? 'private_ip' : undefined,
    }];

    if (isBlocked) {
      emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
        type: 'dns_blocked',
        timestamp: Date.now(),
        url: sanitizedUrl,
        hostname,
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
        message: 'IP literal blocked by policy',
        policy_decision: 'block',
        meta: debug ? { dns_answers: dnsAnswers } : undefined,
      });
      return {
        ok: false,
        error: 'IP literal blocked by policy',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
        evidence: buildErrorEvidence(
          SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
          hostname,
          true,
          dnsAnswers
        ),
      };
    }
    pinnedIp = null; // No pinning needed for IP literals
  } else {
    // Emit DNS start event
    emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
      type: 'dns_start',
      timestamp: Date.now(),
      url: sanitizedUrl,
      hostname,
    });

    // DNS resolution with validation and P1.3 phase timeout
    const dnsPromise = resolveDnsSecure(hostname, ssrfPolicy, dnsResolver, {
      policy: ssrfPolicy,
      allowMixedPublicAndPrivate: allowMixedDns,
    });

    const dnsWithTimeout = await withTimeout(
      dnsPromise,
      dnsTimeoutMs,
      SAFE_FETCH_ERROR_CODES.E_DNS_TIMEOUT
    );

    // Handle DNS timeout
    if (!dnsWithTimeout.ok) {
      emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
        type: 'dns_error',
        timestamp: Date.now(),
        url: sanitizedUrl,
        hostname,
        code: dnsWithTimeout.code,
        message: 'DNS resolution timed out',
        policy_decision: 'block',
      });
      return {
        ok: false,
        error: 'DNS resolution timed out',
        code: dnsWithTimeout.code,
        evidence: buildErrorEvidence(dnsWithTimeout.code, hostname, false),
      };
    }

    const result = dnsWithTimeout.value;

    if (!result.ok) {
      dnsAnswers = result.dns_answers;
      const eventType = result.code === SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED ? 'dns_error' : 'dns_blocked';
      emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
        type: eventType,
        timestamp: Date.now(),
        url: sanitizedUrl,
        hostname,
        code: result.code,
        message: result.error,
        policy_decision: 'block',
        meta: debug ? { dns_answers: dnsAnswers } : undefined,
      });
      return {
        ...result,
        evidence: buildErrorEvidence(
          result.code,
          hostname,
          false,
          dnsAnswers
        ),
      };
    }
    dnsResult = result;
    pinnedIp = result.selectedAddress;

    // Build dns_answers for successful resolution (all allowed)
    dnsAnswers = [
      ...result.ipv4Addresses.map((ip): DnsAnswer => ({ ip, family: 4 })),
      ...result.ipv6Addresses.map((ip): DnsAnswer => ({ ip, family: 6 })),
    ];

    // Emit DNS success event
    emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
      type: 'dns_success',
      timestamp: Date.now(),
      url: sanitizedUrl,
      hostname,
      selected_ip: pinnedIp,
      policy_decision: 'allow',
      meta: debug ? {
        dns_answers: dnsAnswers,
        ipv4_count: result.ipv4Addresses.length,
        ipv6_count: result.ipv6Addresses.length,
      } : {
        ipv4_count: result.ipv4Addresses.length,
        ipv6_count: result.ipv6Addresses.length,
      },
    });
  }

  // Step 4: Build request options with security defaults
  const allowCompression = options?.allowCompression ?? false;
  const fetchHeaders = new Headers(options?.headers);

  // P0.3: Strip hop-by-hop headers (RFC 7230 Section 6.1)
  // This prevents proxy confusion and request smuggling attacks
  stripHopByHopHeaders(fetchHeaders);

  // SECURITY: Drop user-provided Host header to prevent SSRF via Host manipulation
  // The Host header must match the URL, not be controlled by the caller.
  // This prevents attacks where attacker controls Host to redirect internal requests.
  if (fetchHeaders.has('host')) {
    droppedHeaders.push('host');
    fetchHeaders.delete('host');
  }

  // P0.5: Prevent decompression bombs by requesting identity encoding by default
  // Only applies if Accept-Encoding is not already set and compression is not explicitly allowed
  //
  // SECURITY NOTE: Headers.has() is case-insensitive per Fetch API spec.
  // The Headers object normalizes all header names to lowercase internally.
  // We check for 'accept-encoding' (lowercase) to be explicit about this behavior.
  // This prevents bypass via 'Accept-Encoding', 'ACCEPT-ENCODING', or mixed case.
  //
  // NOTE: maxResponseBytes measures WIRE bytes (after identity encoding).
  // If compression is enabled, the actual decoded size could exceed the budget.
  // Only enable compression if you trust the server AND have additional decoded size limits.
  if (!allowCompression && !fetchHeaders.has('accept-encoding')) {
    fetchHeaders.set('Accept-Encoding', 'identity');
  }

  const fetchOptions: SafeFetchOptions = {
    ...options,
    headers: fetchHeaders,
    timeoutMs: totalTimeoutMs,
  };

  // Step 5: Make the request with DNS pinning
  // Emit request start event with dropped headers info
  emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
    type: 'request_start',
    timestamp: Date.now(),
    url: sanitizedUrl,
    hostname,
    selected_ip: pinnedIp ?? hostname,
    meta: {
      method,
      dropped_headers: droppedHeaders.length > 0 ? droppedHeaders : undefined,
    },
  });

  let fetchResult: { response: Response; close: () => Promise<void> };
  try {
    if (dnsResult) {
      // Use Happy Eyeballs for dual-stack hosts
      fetchResult = await attemptWithFallback(url, dnsResult, httpClient, fetchOptions);
    } else {
      // IP literal - direct fetch
      fetchResult = await httpClient.fetch(url, pinnedIp, fetchOptions);
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const code = isTimeout
      ? SAFE_FETCH_ERROR_CODES.E_REQUEST_TIMEOUT
      : SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR;

    emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
      type: 'error',
      timestamp: Date.now(),
      url: sanitizedUrl,
      hostname,
      selected_ip: pinnedIp ?? undefined,
      code,
      // Generic error messages - no internal details
      message: isTimeout ? 'Request timed out' : 'Network error',
    });

    const elapsedMs = Date.now() - requestTimestamp;
    // Build redaction options for tenant mode
    const redactOpts = evidenceLevel === 'tenant' && options?.redactionKey
      ? { key: options.redactionKey, keyId: options?.redactionKeyId }
      : undefined;
    // P0.3: Build network error evidence with proper redaction
    const errorCore: SafeFetchEvidenceCore = {
      schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
      evidence_level: evidenceLevel,
      request_timestamp: requestTimestamp,
      request_url: sanitizedUrl,
      canonical_host: hostname,
      is_ip_literal: hostResult.isIP,
      // Public/tenant evidence: include redacted IP info
      ...(pinnedIp && !isPrivateEvidence ? { selected_ip_info: redactIp(pinnedIp, redactOpts) } : {}),
      // Private evidence: include raw details
      ...(isPrivateEvidence && dnsAnswers ? { dns_answers: dnsAnswers } : {}),
      ...(isPrivateEvidence && pinnedIp ? { selected_ip: pinnedIp } : {}),
      // Public/tenant evidence: include DNS answer counts
      ...(!isPrivateEvidence && dnsAnswers && dnsAnswers.length > 0 ? {
        dns_answer_count: {
          ipv4: dnsAnswers.filter(a => a.family === 4).length,
          ipv6: dnsAnswers.filter(a => a.family === 6).length,
        },
      } : {}),
      policy_decision: 'block',
      decision_code: code,
      max_response_bytes: maxResponseBytes,
      elapsed_ms: elapsedMs,
      dropped_headers: droppedHeaders.length > 0 ? droppedHeaders : undefined,
    };
    const errorEvidence = finalizeEvidence(errorCore, auditCtx);

    if (isTimeout) {
      return {
        ok: false,
        error: 'Request timed out',
        code: SAFE_FETCH_ERROR_CODES.E_REQUEST_TIMEOUT,
        evidence: errorEvidence,
      };
    }

    return {
      ok: false,
      error: 'Network error',
      code: SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR,
      evidence: errorEvidence,
    };
  }

  const { response, close } = fetchResult;
  const responseTimestamp = Date.now();

  // Emit response headers event
  emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
    type: 'response_headers',
    timestamp: responseTimestamp,
    url: sanitizedUrl,
    hostname,
    selected_ip: pinnedIp ?? undefined,
    meta: {
      status: response.status,
      statusText: response.statusText,
    },
  });

  // Helper to build redirect error evidence
  // P0.3: Respects evidenceLevel for redaction
  const buildRedirectErrorEvidence = (code: string): SafeFetchEvidence => {
    // Build redaction options for tenant mode
    const redactOpts = evidenceLevel === 'tenant' && options?.redactionKey
      ? { key: options.redactionKey, keyId: options?.redactionKeyId }
      : undefined;

    const core: SafeFetchEvidenceCore = {
      schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
      evidence_level: evidenceLevel,
      request_timestamp: requestTimestamp,
      response_timestamp: responseTimestamp,
      request_url: sanitizedUrl,
      canonical_host: hostname,
      is_ip_literal: hostResult.isIP,
      policy_decision: 'block',
      decision_code: code,
      response_status: response.status,
      max_response_bytes: maxResponseBytes,
      elapsed_ms: responseTimestamp - requestTimestamp,
      dropped_headers: droppedHeaders.length > 0 ? droppedHeaders : undefined,
    };

    // Add IP-related fields based on evidence level
    if (pinnedIp) {
      if (isPrivateEvidence) {
        core.selected_ip = pinnedIp;
      } else {
        core.selected_ip_info = redactIp(pinnedIp, redactOpts);
      }
    }

    // Add DNS answers based on evidence level
    if (dnsAnswers && dnsAnswers.length > 0) {
      if (isPrivateEvidence) {
        core.dns_answers = dnsAnswers;
      } else {
        core.dns_answer_count = {
          ipv4: dnsAnswers.filter(a => a.family === 4).length,
          ipv6: dnsAnswers.filter(a => a.family === 6).length,
        };
      }
    }

    return finalizeEvidence(core, auditCtx);
  };

  // Step 6: Handle redirects
  if (response.status >= 300 && response.status < 400) {
    // Close current response before following redirect
    await close();

    const location = response.headers.get('location');
    if (!location) {
      return {
        ok: false,
        error: 'Redirect response missing Location header',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED,
        evidence: buildRedirectErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED),
      };
    }

    // Check redirect count
    if (internalOptions._redirectCount! >= maxRedirects) {
      return {
        ok: false,
        error: 'Too many redirects',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS,
        evidence: buildRedirectErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_TOO_MANY_REDIRECTS),
      };
    }

    // Resolve redirect URL
    const redirectUrl = new URL(location, url);
    const originalUrl = new URL(internalOptions._originalOrigin!);

    // Emit redirect event
    emitAuditEvent(auditCtx, onEvent, hookSanitizer, 'onEvent', {
      type: 'redirect',
      timestamp: Date.now(),
      url: sanitizedUrl,
      hostname,
      selected_ip: pinnedIp ?? undefined,
      meta: {
        redirect_to: sanitizeUrl(redirectUrl.toString()),
        redirect_count: internalOptions._redirectCount! + 1,
      },
    });

    // Check redirect policy
    if (!isRedirectAllowed(originalUrl, redirectUrl, redirectPolicy, options?.redirectAllowHosts)) {
      return {
        ok: false,
        error: 'Redirect blocked by policy',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED,
        evidence: buildRedirectErrorEvidence(SAFE_FETCH_ERROR_CODES.E_SSRF_REDIRECT_BLOCKED),
      };
    }

    // Recursive call with incremented redirect count
    // IMPORTANT: Full re-validation occurs for redirects
    return safeFetchRaw(redirectUrl.toString(), {
      ...options,
      _redirectCount: internalOptions._redirectCount! + 1,
      _originalHost: internalOptions._originalHost,
      _originalOrigin: internalOptions._originalOrigin,
    } as SafeFetchOptions);
  }

  // Build success evidence with P0.3 redaction
  const effectiveIp = pinnedIp ?? (hostResult.isIP ? hostname : undefined);
  // Build redaction options for tenant mode
  const redactOptsSuccess = evidenceLevel === 'tenant' && options?.redactionKey
    ? { key: options.redactionKey, keyId: options?.redactionKeyId }
    : undefined;
  const successCore: SafeFetchEvidenceCore = {
    schema_version: SAFE_FETCH_EVIDENCE_SCHEMA_VERSION,
    evidence_level: evidenceLevel,
    request_timestamp: requestTimestamp,
    response_timestamp: responseTimestamp,
    request_url: sanitizedUrl,
    canonical_host: hostname,
    is_ip_literal: hostResult.isIP,
    // Public/tenant evidence: include redacted IP info
    ...(effectiveIp && !isPrivateEvidence ? { selected_ip_info: redactIp(effectiveIp, redactOptsSuccess) } : {}),
    // Private evidence: include raw details
    ...(isPrivateEvidence && dnsAnswers ? { dns_answers: dnsAnswers } : {}),
    ...(isPrivateEvidence && effectiveIp ? { selected_ip: effectiveIp } : {}),
    // Public/tenant evidence: include DNS answer counts
    ...(!isPrivateEvidence && dnsAnswers && dnsAnswers.length > 0 ? {
      dns_answer_count: {
        ipv4: dnsAnswers.filter(a => a.family === 4).length,
        ipv6: dnsAnswers.filter(a => a.family === 6).length,
      },
    } : {}),
    policy_decision: 'allow',
    decision_code: 'OK',
    response_status: response.status,
    max_response_bytes: maxResponseBytes,
    elapsed_ms: responseTimestamp - requestTimestamp,
    dropped_headers: droppedHeaders.length > 0 ? droppedHeaders : undefined,
  };
  const successEvidence = finalizeEvidence(successCore, auditCtx);

  return {
    ok: true,
    response,
    close,
    warnings: warnings.length > 0 ? warnings : undefined,
    evidence: successEvidence,
  };
}

/**
 * SSRF-safe JSON fetch with proper DNS resolution pinning and size limits
 *
 * This is the recommended function for fetching JSON APIs (JWKS, OIDC, etc.)
 */
export async function safeFetchJson<T = unknown>(
  url: string,
  options?: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  const maxResponseBytes = options?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const rawResult = await safeFetchRaw(url, options);
  if (!rawResult.ok) {
    return rawResult;
  }

  const { response, close, warnings, evidence } = rawResult;

  try {
    // Read body with size limit
    const bodyResult = await readBodyWithLimit(response, maxResponseBytes);
    if (!bodyResult.ok) {
      // Add evidence to body read errors (recompute digest)
      const { evidence_digest, evidence_alg, canonicalization, ...baseEvidence } = evidence;
      const errorCore: SafeFetchEvidenceCore = {
        ...baseEvidence,
        policy_decision: 'block',
        decision_code: bodyResult.code,
      };
      return {
        ...bodyResult,
        evidence: finalizeEvidence(errorCore),
      };
    }

    // Parse JSON
    const text = new TextDecoder().decode(bodyResult.body);
    const data = JSON.parse(text) as T;

    // Update evidence with actual response bytes (recompute digest)
    const { evidence_digest, evidence_alg, canonicalization, ...baseEvidence } = evidence;
    const finalCore: SafeFetchEvidenceCore = {
      ...baseEvidence,
      response_bytes: bodyResult.body.byteLength,
    };
    const finalEvidence = finalizeEvidence(finalCore);

    return {
      ok: true,
      response,
      data,
      warnings,
      evidence: finalEvidence,
    };
  } catch (err) {
    // Strip digest fields before modifying
    const { evidence_digest, evidence_alg, canonicalization, ...baseEvidence } = evidence;
    if (err instanceof SyntaxError) {
      const errorCore: SafeFetchEvidenceCore = {
        ...baseEvidence,
        policy_decision: 'block',
        decision_code: SAFE_FETCH_ERROR_CODES.E_PARSE_ERROR,
      };
      return {
        ok: false,
        error: 'Failed to parse JSON response',
        code: SAFE_FETCH_ERROR_CODES.E_PARSE_ERROR,
        evidence: finalizeEvidence(errorCore),
      };
    }
    const errorCore: SafeFetchEvidenceCore = {
      ...baseEvidence,
      policy_decision: 'block',
      decision_code: SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR,
    };
    return {
      ok: false,
      error: 'Failed to read response body',
      code: SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR,
      evidence: finalizeEvidence(errorCore),
    };
  } finally {
    // IMPORTANT: Always close the agent after body consumption
    await close();
  }
}

/**
 * SSRF-safe fetch with JSON parsing (legacy API, use safeFetchJson for new code)
 *
 * @deprecated Use safeFetchJson for better type safety and structured errors
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  return safeFetchJson<T>(url, options);
}

/**
 * SSRF-safe fetch for JWKS endpoints
 *
 * Convenience wrapper around safeFetchJson with JWKS-specific defaults:
 * - Shorter timeout (10 seconds)
 * - No redirects by default
 * - Smaller response size limit (512 KB)
 * - Type-safe JWKS response
 */
export async function safeFetchJWKS(
  url: string,
  options?: Omit<SafeFetchOptions, 'maxRedirects'>
): Promise<SafeFetchResult<{ keys: unknown[] }>> {
  return safeFetchJson<{ keys: unknown[] }>(url, {
    ...options,
    timeoutMs: options?.timeoutMs ?? 10000,
    maxRedirects: 0, // JWKS endpoints should not redirect
    maxResponseBytes: options?.maxResponseBytes ?? MAX_JWKS_RESPONSE_BYTES,
  });
}

// NOTE: Internal functions are now in impl.ts and NOT exported from main entry.
// Access internal utilities via '@peac/net-node/testing' subpath only.
