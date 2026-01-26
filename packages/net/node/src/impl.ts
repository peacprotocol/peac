/**
 * Internal Implementation for @peac/net-node
 *
 * This module contains internal helper functions that are NOT part of the public API.
 * These functions are used internally by index.ts and exposed ONLY via the testing subpath.
 *
 * IMPORTANT: This module is NOT listed in package.json exports, so it cannot be
 * directly imported by consumers. Only the testing subpath re-exports from here.
 *
 * @internal
 * @module @peac/net-node/impl
 */

import { createHash, createHmac } from 'crypto';
import ipaddr from 'ipaddr.js';
import { getDomain, parse as parseDomain } from 'tldts';
import { Agent, type Dispatcher } from 'undici';
// Local SSRF types (not from @peac/schema to keep package self-contained)
import { type SSRFPolicy, ALLOW_DANGEROUS_CIDRS_ACK } from './ssrf.js';

// Import from single source of truth modules (no circular deps)
import { SAFE_FETCH_ERROR_CODES } from './codes.js';
import { MAX_PENDING_AUDIT_EVENTS, SAFE_FETCH_EVENT_SCHEMA_VERSION } from './constants.js';

// Re-export for consumers
export { MAX_PENDING_AUDIT_EVENTS };

// -----------------------------------------------------------------------------
// Type Imports (type-only to avoid runtime circular dependencies)
// -----------------------------------------------------------------------------

import type {
  SafeFetchOptions,
  SafeFetchAuditHook,
  SafeFetchEvent,
  DnsResolutionResult,
  DnsResolutionError,
  DnsAnswer,
  DnsResolver,
  HttpClient,
  HttpClientTimeouts,
  RedactedIpInfo,
  RedirectPolicy,
  TimeoutConfig,
} from './index.js';

// Re-export types needed by impl
export type { DnsAnswer, RedactedIpInfo };

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Happy Eyeballs connection timeout for first attempt (250ms)
 */
export const HAPPY_EYEBALLS_FIRST_TIMEOUT_MS = 250;

/**
 * Hop-by-hop headers that MUST NOT be forwarded (RFC 7230 Section 6.1)
 * These are stripped from requests to prevent proxy confusion and smuggling
 */
export const HOP_BY_HOP_HEADERS: Set<string> = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Common non-standard hop-by-hop headers
  'proxy-connection',
]);

// -----------------------------------------------------------------------------
// RFC 6890-grade IP Range Classification
// Uses ipaddr.js range() for comprehensive special-use detection
// -----------------------------------------------------------------------------

/**
 * Blocked IPv4 range names from ipaddr.js
 * These are always blocked (fail-closed security)
 */
export const BLOCKED_IPV4_RANGES: Set<string> = new Set([
  'unspecified', // 0.0.0.0/8
  'broadcast', // 255.255.255.255/32
  'loopback', // 127.0.0.0/8
  'private', // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  'linkLocal', // 169.254.0.0/16
  'carrierGradeNat', // 100.64.0.0/10 (CGNAT - special handling)
  'reserved', // 240.0.0.0/4
  'multicast', // 224.0.0.0/4
]);

/**
 * Additional IPv4 CIDR ranges to block (RFC 6890 compliance)
 * Not covered by ipaddr.js range() but should be blocked
 */
export const ADDITIONAL_BLOCKED_CIDRS_V4: Array<[ipaddr.IPv4, number]> = [
  [ipaddr.IPv4.parse('192.0.0.0'), 24], // IETF Protocol Assignments
  [ipaddr.IPv4.parse('192.0.2.0'), 24], // Documentation (TEST-NET-1)
  [ipaddr.IPv4.parse('198.18.0.0'), 15], // Benchmarking
  [ipaddr.IPv4.parse('198.51.100.0'), 24], // Documentation (TEST-NET-2)
  [ipaddr.IPv4.parse('203.0.113.0'), 24], // Documentation (TEST-NET-3)
];

/**
 * Blocked IPv6 range names from ipaddr.js
 */
export const BLOCKED_IPV6_RANGES: Set<string> = new Set([
  'unspecified', // ::/128
  'loopback', // ::1/128
  'linkLocal', // fe80::/10
  'uniqueLocal', // fc00::/7
  'multicast', // ff00::/8
  'reserved', // various reserved ranges
]);

/**
 * Additional IPv6 CIDR ranges to block
 */
export const ADDITIONAL_BLOCKED_CIDRS_V6: Array<[ipaddr.IPv6, number]> = [
  [ipaddr.IPv6.parse('2001:db8::'), 32], // Documentation
  [ipaddr.IPv6.parse('2001::'), 23], // TEREDO (deprecated)
  [ipaddr.IPv6.parse('2002::'), 16], // 6to4 (deprecated)
  [ipaddr.IPv6.parse('64:ff9b::'), 96], // NAT64
  [ipaddr.IPv6.parse('100::'), 64], // Discard prefix
];

// Error codes imported from codes.ts (single source of truth)
// Re-export for testing subpath consumers
export { SAFE_FETCH_ERROR_CODES };

// -----------------------------------------------------------------------------
// P0.3: Evidence Redaction Helpers
// -----------------------------------------------------------------------------

/**
 * Hash an IP address for public evidence using SHA-256
 *
 * Returns a 0x-prefixed lowercase hex string for consistency with
 * other PEAC cryptographic identifiers (e.g., EAS anchors).
 *
 * @param ip - Raw IP address string
 * @returns SHA-256 hash as 0x-prefixed lowercase hex
 * @internal
 */
export function hashIpAddress(ip: string): string {
  const hash = createHash('sha256').update(ip, 'utf8').digest('hex');
  return `0x${hash}`;
}

/**
 * HMAC-SHA256 hash an IP address for tenant-level evidence
 *
 * Uses keyed hashing to prevent cross-tenant correlation via rainbow tables.
 * Unlike plain SHA-256, this requires knowledge of the key to correlate.
 *
 * @param ip - Raw IP address string
 * @param key - HMAC key (must be at least 32 bytes)
 * @returns HMAC-SHA256 hash as 0x-prefixed lowercase hex
 * @internal
 */
function hmacIpAddress(ip: string, key: Uint8Array): string {
  if (key.length < 32) {
    throw new Error('Redaction key must be at least 32 bytes for security');
  }
  const hash = createHmac('sha256', key).update(ip, 'utf8').digest('hex');
  return `0x${hash}`;
}

/**
 * Create redacted IP info for public evidence
 *
 * @param ip - Raw IP address string
 * @param options - Optional HMAC key for tenant mode
 * @returns Redacted info with family and hash
 * @internal
 */
export function redactIp(
  ip: string,
  options?: { key?: Uint8Array; keyId?: string }
): RedactedIpInfo {
  const isIPv6 = ip.includes(':');
  const result: RedactedIpInfo = {
    family: isIPv6 ? 6 : 4,
    hash: options?.key ? hmacIpAddress(ip, options.key) : hashIpAddress(ip),
  };
  if (options?.keyId) {
    result.key_id = options.keyId;
  }
  return result;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Header input type (compatible with RequestInit.headers)
 * Using a type alias to avoid dependency on DOM types
 */
type HeaderInput = Headers | Record<string, string> | Array<[string, string]> | undefined;

/**
 * Case-insensitive header presence check
 *
 * Works with any header input type (Headers, array, object).
 * The Fetch API's Headers object is case-insensitive by spec, but this helper
 * provides explicit case-insensitive checking for any input format.
 *
 * @param headers - Headers, array of [name, value] pairs, or plain object
 * @param name - Header name to check (case-insensitive)
 * @returns true if header exists (any casing)
 * @internal
 */
export function hasHeaderCaseInsensitive(headers: HeaderInput, name: string): boolean {
  if (!headers) return false;
  const lowerName = name.toLowerCase();

  if (headers instanceof Headers) {
    // Headers.has() is case-insensitive by spec
    return headers.has(lowerName);
  }

  if (Array.isArray(headers)) {
    return headers.some(([k]) => k.toLowerCase() === lowerName);
  }

  // Plain object
  return Object.keys(headers).some((k) => k.toLowerCase() === lowerName);
}

/**
 * Parse a CIDR string into an ipaddr.js address and prefix length
 * @internal
 */
export function parseCidr(cidrStr: string): [ipaddr.IPv4 | ipaddr.IPv6, number] | null {
  try {
    const [network, prefixLen] = ipaddr.parseCIDR(cidrStr);
    return [network, prefixLen];
  } catch {
    return null;
  }
}

/**
 * Check if an IP address matches any CIDR in a list
 * @internal
 */
export function matchesAnyCidr(addr: ipaddr.IPv4 | ipaddr.IPv6, cidrStrings: string[]): boolean {
  for (const cidrStr of cidrStrings) {
    const parsed = parseCidr(cidrStr);
    if (!parsed) continue;

    const [network, prefixLen] = parsed;
    if (addr.kind() !== network.kind()) continue;

    if (addr.match(network, prefixLen)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert IPv4 to uint32 for range comparison
 * @internal
 */
function ipv4ToUint32(ip: ipaddr.IPv4): number {
  const octets = ip.octets;
  return (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

/**
 * Convert IPv6 to BigInt for range comparison
 * @internal
 */
function ipv6ToBigInt(ip: ipaddr.IPv6): bigint {
  const parts = ip.parts;
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    result = (result << BigInt(16)) + BigInt(parts[i]);
  }
  return result;
}

/**
 * Calculate CIDR end address for IPv4
 * @internal
 */
function ipv4CidrEnd(network: ipaddr.IPv4, prefixLen: number): number {
  const start = ipv4ToUint32(network);
  const hostBits = 32 - prefixLen;
  return start + ((1 << hostBits) - 1);
}

/**
 * Calculate CIDR end address for IPv6
 * @internal
 */
function ipv6CidrEnd(network: ipaddr.IPv6, prefixLen: number): bigint {
  const start = ipv6ToBigInt(network);
  const hostBits = BigInt(128 - prefixLen);
  return start + ((BigInt(1) << hostBits) - BigInt(1));
}

/**
 * Check if two IPv4 CIDR ranges overlap using robust range comparison
 * @internal
 */
function ipv4RangesOverlap(
  net1: ipaddr.IPv4,
  prefix1: number,
  net2: ipaddr.IPv4,
  prefix2: number
): boolean {
  const start1 = ipv4ToUint32(net1);
  const end1 = ipv4CidrEnd(net1, prefix1);
  const start2 = ipv4ToUint32(net2);
  const end2 = ipv4CidrEnd(net2, prefix2);

  // Ranges overlap if one starts before the other ends
  return start1 <= end2 && start2 <= end1;
}

/**
 * Check if two IPv6 CIDR ranges overlap using robust range comparison
 * @internal
 */
function ipv6RangesOverlap(
  net1: ipaddr.IPv6,
  prefix1: number,
  net2: ipaddr.IPv6,
  prefix2: number
): boolean {
  const start1 = ipv6ToBigInt(net1);
  const end1 = ipv6CidrEnd(net1, prefix1);
  const start2 = ipv6ToBigInt(net2);
  const end2 = ipv6CidrEnd(net2, prefix2);

  // Ranges overlap if one starts before the other ends
  return start1 <= end2 && start2 <= end1;
}

/**
 * Check if a CIDR string overlaps with any dangerous/private ranges
 * Uses robust range-based overlap detection (conservative - false positives OK)
 * @internal
 */
export function cidrOverlapsDangerousRanges(cidrStr: string): boolean {
  const parsed = parseCidr(cidrStr);
  if (!parsed) {
    // If we can't parse, treat as dangerous (fail-closed)
    return true;
  }

  const [network, prefixLen] = parsed;

  try {
    if (network.kind() === 'ipv4') {
      // Type assertion: we've confirmed it's IPv4 via kind() check
      const networkV4 = network as ipaddr.IPv4;

      // Check if the network address itself falls into a blocked range
      const range = networkV4.range();
      if (BLOCKED_IPV4_RANGES.has(range)) {
        return true;
      }

      // Check overlap with additional blocked CIDRs using robust range comparison
      for (const [blockedNet, blockedPrefix] of ADDITIONAL_BLOCKED_CIDRS_V4) {
        if (ipv4RangesOverlap(networkV4, prefixLen, blockedNet, blockedPrefix)) {
          return true;
        }
      }

      // Also check if any IP in the CIDR could fall into ipaddr.js special ranges
      // Sample endpoints and midpoint of the CIDR
      const samplePoints = [
        ipv4ToUint32(networkV4),
        ipv4CidrEnd(networkV4, prefixLen),
        Math.floor((ipv4ToUint32(networkV4) + ipv4CidrEnd(networkV4, prefixLen)) / 2),
      ];

      for (const point of samplePoints) {
        try {
          const testIp = ipaddr.IPv4.parse(
            `${(point >>> 24) & 0xff}.${(point >>> 16) & 0xff}.${(point >>> 8) & 0xff}.${point & 0xff}`
          );
          if (BLOCKED_IPV4_RANGES.has(testIp.range())) {
            return true;
          }
        } catch {
          // Parsing error, skip this sample
        }
      }
    } else {
      // Type assertion: we've confirmed it's IPv6 via kind() check
      const networkV6 = network as ipaddr.IPv6;

      // IPv6
      const range = networkV6.range();
      if (BLOCKED_IPV6_RANGES.has(range)) {
        return true;
      }

      for (const [blockedNet, blockedPrefix] of ADDITIONAL_BLOCKED_CIDRS_V6) {
        if (ipv6RangesOverlap(networkV6, prefixLen, blockedNet, blockedPrefix)) {
          return true;
        }
      }
    }
  } catch {
    // Any error during calculation, treat as dangerous (fail-closed)
    return true;
  }

  return false;
}

/**
 * Check if an IP address is private/reserved using RFC 6890-grade classification
 * @internal
 */
export function isPrivateIP(ip: string, policy?: SSRFPolicy): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.process(ip);
  } catch {
    // Invalid IP - treat as private (fail-closed)
    return true;
  }

  // Check allowCidrs first (higher precedence)
  // But only if dangerous ack is provided when allowCidrs contains dangerous ranges
  if (policy?.allowCidrs && policy.allowCidrs.length > 0) {
    // Validate ack is present if any allowCidr overlaps dangerous ranges
    const hasDangerousAllowCidr = policy.allowCidrs.some(cidrOverlapsDangerousRanges);
    const hasAck = policy.ack_allow_dangerous_cidrs === ALLOW_DANGEROUS_CIDRS_ACK;

    if (hasDangerousAllowCidr && !hasAck) {
      // Fail-closed: ignore allowCidrs without proper ack
      // The caller should check this before calling
    } else if (matchesAnyCidr(addr, policy.allowCidrs)) {
      return false; // Explicitly allowed
    }
  }

  // Check custom blockedCidrs
  if (policy?.blockedCidrs && policy.blockedCidrs.length > 0) {
    if (matchesAnyCidr(addr, policy.blockedCidrs)) {
      return true; // Explicitly blocked
    }
  }

  // Use ipaddr.js range() for RFC 6890-grade classification
  const range = addr.range();

  if (addr.kind() === 'ipv4') {
    // Check if range is blocked
    if (BLOCKED_IPV4_RANGES.has(range)) {
      // Special case: CGNAT requires explicit ack
      if (range === 'carrierGradeNat') {
        const cgnatAllowed =
          policy?.allowCgnat && policy?.ack_allow_cgnat === 'I_UNDERSTAND_CGNAT_SECURITY_RISKS';
        return !cgnatAllowed;
      }
      return true;
    }

    // Check additional blocked CIDRs
    for (const [network, prefix] of ADDITIONAL_BLOCKED_CIDRS_V4) {
      if (addr.match(network, prefix)) {
        return true;
      }
    }
  } else {
    // IPv6
    if (BLOCKED_IPV6_RANGES.has(range)) {
      return true;
    }

    // Check additional blocked CIDRs
    for (const [network, prefix] of ADDITIONAL_BLOCKED_CIDRS_V6) {
      if (addr.match(network, prefix)) {
        return true;
      }
    }
  }

  // Only unicast global addresses are allowed
  return range !== 'unicast';
}

/**
 * Validate that allowCidrs has proper acknowledgment if it contains dangerous ranges
 * @internal
 */
export function validateAllowCidrsAck(policy?: SSRFPolicy): { valid: boolean; error?: string } {
  if (!policy?.allowCidrs || policy.allowCidrs.length === 0) {
    return { valid: true };
  }

  const hasDangerousAllowCidr = policy.allowCidrs.some(cidrOverlapsDangerousRanges);
  if (hasDangerousAllowCidr) {
    if (policy.ack_allow_dangerous_cidrs !== ALLOW_DANGEROUS_CIDRS_ACK) {
      return {
        valid: false,
        error: `allowCidrs contains private/dangerous ranges but ack_allow_dangerous_cidrs is not set to "${ALLOW_DANGEROUS_CIDRS_ACK}"`,
      };
    }
  }

  return { valid: true };
}

// -----------------------------------------------------------------------------
// Canonical Host Pipeline
// Single source of truth for hostname canonicalization
// -----------------------------------------------------------------------------

/**
 * Check if a hostname contains an IPv6 zone identifier
 *
 * Zone identifiers (e.g., %eth0, %25eth0) are used for link-local addresses
 * and MUST be rejected to prevent SSRF bypasses via interface binding.
 *
 * @param hostname - Raw hostname from URL
 * @returns true if zone ID is present
 * @internal
 */
export function hasIPv6ZoneId(hostname: string): boolean {
  // Zone IDs appear as %<zone> in raw form or %25<zone> when URL-encoded
  // They only appear in IPv6 addresses (bracketed in URLs)
  return hostname.includes('%') || hostname.includes('%25');
}

/**
 * Normalize IPv4-mapped IPv6 address to IPv4
 *
 * IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) can bypass IPv4 blocklists
 * if not normalized. We convert them to plain IPv4 for consistent blocking.
 *
 * @param ip - IP address string
 * @returns Normalized IP (IPv4 if it was IPv4-mapped, otherwise unchanged)
 * @internal
 */
export function normalizeIPv4MappedIPv6(ip: string): string {
  try {
    const parsed = ipaddr.parse(ip);
    // ipaddr.process() automatically converts IPv4-mapped IPv6 to IPv4
    // We use it explicitly here for clarity
    if (parsed.kind() === 'ipv6') {
      const v6 = parsed as ipaddr.IPv6;
      // Check if this is an IPv4-mapped IPv6 address
      if (v6.isIPv4MappedAddress()) {
        return v6.toIPv4Address().toString();
      }
    }
    return parsed.toString();
  } catch {
    return ip;
  }
}

/**
 * Canonical host result
 */
interface CanonicalHostResult {
  ok: true;
  hostname: string;
  isIP: boolean;
  originalHostname: string;
}

interface CanonicalHostError {
  ok: false;
  error: string;
  code: string;
}

/**
 * Canonicalize a hostname with full security validation
 *
 * This is the single source of truth for hostname processing:
 * 1. Reject IPv6 zone identifiers (SSRF bypass prevention)
 * 2. Lowercase and strip trailing dot
 * 3. Normalize IDNs to ASCII (punycode)
 * 4. Normalize IPv4-mapped IPv6 to IPv4
 *
 * @param hostname - Raw hostname from URL
 * @returns Canonicalized hostname or error
 * @internal
 */
export function canonicalizeHost(hostname: string): CanonicalHostResult | CanonicalHostError {
  const original = hostname;
  let normalized = hostname.trim().toLowerCase();

  // P0.1a: Reject IPv6 zone identifiers
  // These can be used to bind to specific network interfaces, bypassing SSRF controls
  if (hasIPv6ZoneId(normalized)) {
    return {
      ok: false,
      error: `IPv6 zone identifiers are not allowed: ${hostname}`,
      code: SAFE_FETCH_ERROR_CODES.E_SSRF_IPV6_ZONE_ID,
    };
  }

  // Strip trailing dot (FQDN form)
  if (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }

  // Check if it's an IP address BEFORE any domain processing
  if (ipaddr.isValid(normalized)) {
    // P0.1b: Normalize IPv4-mapped IPv6 to IPv4
    // This ensures ::ffff:127.0.0.1 is blocked just like 127.0.0.1
    normalized = normalizeIPv4MappedIPv6(normalized);
    return {
      ok: true,
      hostname: normalized,
      isIP: true,
      originalHostname: original,
    };
  }

  // P0.1c: Normalize IDNs to ASCII (punycode)
  // This prevents homograph attacks and ensures consistent comparison
  try {
    // Node's url module provides WHATWG URL-compliant IDN handling
    const asciiHost = new URL(`http://${normalized}`).hostname;
    normalized = asciiHost;
  } catch {
    // If URL parsing fails, try tldts for punycode
    const parsed = parseDomain(normalized);
    normalized = parsed.hostname ?? normalized;
  }

  // Validate the result is non-empty
  if (!normalized) {
    return {
      ok: false,
      error: `Invalid hostname: ${hostname}`,
      code: SAFE_FETCH_ERROR_CODES.E_SSRF_INVALID_HOST,
    };
  }

  return {
    ok: true,
    hostname: normalized,
    isIP: false,
    originalHostname: original,
  };
}

/**
 * Strip hop-by-hop headers from request headers
 *
 * RFC 7230 Section 6.1 defines hop-by-hop headers that MUST NOT be forwarded.
 * Stripping these prevents proxy confusion and request smuggling attacks.
 *
 * @param headers - Headers object to sanitize (mutated in place)
 * @internal
 */
export function stripHopByHopHeaders(headers: Headers): void {
  // First, check the Connection header for additional hop-by-hop headers
  const connectionHeader = headers.get('connection');
  if (connectionHeader) {
    // Connection header can list additional headers to treat as hop-by-hop
    const additionalHeaders = connectionHeader
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0);

    for (const header of additionalHeaders) {
      headers.delete(header);
    }
  }

  // Remove standard hop-by-hop headers
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
}

/**
 * Normalize hostname for comparison:
 * - Lowercase
 * - Strip trailing dot
 * - Convert to ASCII (punycode)
 * - Normalize IPv4-mapped IPv6
 * @internal
 */
export function normalizeHostname(hostname: string): string {
  const result = canonicalizeHost(hostname);
  if (!result.ok) {
    // For backwards compatibility, return the trimmed lowercase version
    // The error will be caught elsewhere in the pipeline
    return hostname.trim().toLowerCase();
  }
  return result.hostname;
}

/**
 * Extract registrable domain (eTLD+1) from hostname using proper PSL
 * Uses tldts library for accurate Public Suffix List matching
 *
 * IMPORTANT: This function accepts a hostname (from URL.hostname), NOT a host:port string.
 * IPv6 addresses are returned as-is (they don't have registrable domains).
 *
 * @param hostname - A hostname (e.g., "example.com", "2001:db8::1"), NOT "host:port"
 * @internal
 */
export function getRegistrableDomain(hostname: string): string {
  const normalized = normalizeHostname(hostname);

  // Handle IP addresses (both IPv4 and IPv6)
  // IPv6 addresses contain ':' and must not be split
  if (ipaddr.isValid(normalized)) {
    return normalized;
  }

  // Use tldts for proper eTLD+1 extraction
  // SECURITY: allowPrivateDomains=true ensures that public suffix list entries
  // like github.io, blogspot.com are treated as public suffixes.
  // This prevents user1.github.io from redirecting to user2.github.io
  // with same-registrable-domain policy.
  const domain = getDomain(normalized, { allowPrivateDomains: true });

  // If getDomain returns null (invalid or TLD-only), return normalized hostname
  // This handles edge cases like localhost, single-label names, or TLDs
  return domain ?? normalized;
}

/**
 * Check if redirect target is allowed by policy
 * @internal
 */
export function isRedirectAllowed(
  originalUrl: URL,
  redirectUrl: URL,
  policy: RedirectPolicy,
  allowHosts?: string[]
): boolean {
  switch (policy) {
    case 'none':
      return false;

    case 'same-origin':
      return originalUrl.protocol === redirectUrl.protocol && originalUrl.host === redirectUrl.host;

    case 'same-registrable-domain': {
      if (originalUrl.protocol !== redirectUrl.protocol) {
        // Allow http -> https upgrade
        if (!(originalUrl.protocol === 'http:' && redirectUrl.protocol === 'https:')) {
          return false;
        }
      }
      const origDomain = getRegistrableDomain(originalUrl.hostname);
      const redirDomain = getRegistrableDomain(redirectUrl.hostname);
      if (origDomain === redirDomain) {
        return true;
      }
      // Check additional allow hosts
      if (allowHosts?.includes(redirectUrl.hostname)) {
        return true;
      }
      if (allowHosts?.includes(redirDomain)) {
        return true;
      }
      return false;
    }

    case 'allowlist':
      if (!allowHosts || allowHosts.length === 0) {
        return false;
      }
      return (
        allowHosts.includes(redirectUrl.hostname) ||
        allowHosts.includes(getRegistrableDomain(redirectUrl.hostname))
      );

    default:
      return false;
  }
}

// -----------------------------------------------------------------------------
// Pinned Agent Creation
// -----------------------------------------------------------------------------

/**
 * Options for creating a pinned agent
 * @internal
 */
interface PinnedAgentOptions {
  /** TCP/TLS connect timeout in milliseconds */
  connectTimeoutMs?: number;
}

/**
 * Create an undici Agent with DNS pinning and optional connect timeout
 * @internal
 */
export function createPinnedAgent(
  pinnedIp: string,
  _hostname: string,
  options?: PinnedAgentOptions
): Agent {
  return new Agent({
    connect: {
      // P1.3: Pass connect timeout to undici
      timeout: options?.connectTimeoutMs,
      // Custom lookup function that returns only the pinned IP
      lookup: (
        _lookupHostname: string,
        _options: unknown,
        callback: (err: Error | null, address: string, family: number) => void
      ) => {
        // Determine address family
        const isIPv6 = pinnedIp.includes(':');
        callback(null, pinnedIp, isIPv6 ? 6 : 4);
      },
    },
  });
}

// -----------------------------------------------------------------------------
// DNS Resolution with Happy Eyeballs-style Selection
// -----------------------------------------------------------------------------

/**
 * Options for DNS resolution
 * @internal
 */
interface DnsResolveOptions {
  policy: SSRFPolicy;
  allowMixedPublicAndPrivate?: boolean;
}

/**
 * P1.3: Wrap a promise with a timeout
 * Returns a discriminated union to distinguish timeout from actual result
 * @internal
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutCode: string
): Promise<{ ok: true; value: T } | { ok: false; code: string }> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ ok: false; code: string }>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ ok: false, code: timeoutCode });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.then((value): { ok: true; value: T } => ({ ok: true, value })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Resolve DNS and validate ALL resolved IPs, returning only safe ones
 * Implements RFC 8305-style address family ordering
 *
 * SECURITY NOTES:
 * - Error messages are intentionally generic to avoid leaking internal IPs
 * - Structured dns_answers are returned for audit trail (debug mode only reveals in events)
 * - Mixed DNS (public + private) requires explicit opt-in
 *
 * @internal
 */
export async function resolveDnsSecure(
  hostname: string,
  policy: SSRFPolicy,
  resolver: DnsResolver,
  dnsOptions?: DnsResolveOptions
): Promise<DnsResolutionResult | DnsResolutionError> {
  const allowMixed = dnsOptions?.allowMixedPublicAndPrivate ?? false;

  try {
    const { ipv4, ipv6 } = await resolver.resolveAll(hostname);
    const allAddresses = [...ipv6, ...ipv4]; // Prefer IPv6 per RFC 8305

    if (allAddresses.length === 0) {
      return {
        ok: false,
        // Generic error message - no hostname in production logs
        error: 'DNS resolution returned no addresses',
        code: SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED,
      };
    }

    // Build structured DNS answers for audit trail
    const dnsAnswers: DnsAnswer[] = [];

    // Validate ALL resolved IPs - reject if ANY is private (unless allowMixed)
    const safeIpv4: string[] = [];
    const safeIpv6: string[] = [];
    const blockedAddresses: string[] = [];

    for (const address of ipv4) {
      const isBlocked = isPrivateIP(address, policy);
      dnsAnswers.push({
        ip: address,
        family: 4,
        blocked_reason: isBlocked ? 'private_ip' : undefined,
      });
      if (isBlocked) {
        blockedAddresses.push(address);
      } else {
        safeIpv4.push(address);
      }
    }

    for (const address of ipv6) {
      const isBlocked = isPrivateIP(address, policy);
      dnsAnswers.push({
        ip: address,
        family: 6,
        blocked_reason: isBlocked ? 'private_ip' : undefined,
      });
      if (isBlocked) {
        blockedAddresses.push(address);
      } else {
        safeIpv6.push(address);
      }
    }

    // SECURITY: If ANY address is private, we normally block the request
    // This prevents attackers from adding a public IP alongside a private one
    if (blockedAddresses.length > 0) {
      const hasPublicIps = safeIpv4.length > 0 || safeIpv6.length > 0;

      // P0.2: Use distinct error codes for audit-clean logging
      if (hasPublicIps) {
        // Mixed DNS scenario: both public and private IPs returned
        if (allowMixed) {
          // Mixed mode: allow request but only use public IPs
          // The caller should have validated the ack before enabling this
          const safeAddresses = [...safeIpv6, ...safeIpv4];
          return {
            ok: true,
            addresses: safeAddresses,
            selectedAddress: safeAddresses[0],
            ipv4Addresses: safeIpv4,
            ipv6Addresses: safeIpv6,
          };
        }

        // Mixed DNS blocked - distinct from pure private IP
        // Generic error message - details in dns_answers for audit
        return {
          ok: false,
          error: 'DNS returned mixed public/private addresses (blocked by policy)',
          code: SAFE_FETCH_ERROR_CODES.E_SSRF_MIXED_DNS_BLOCKED,
          dns_answers: dnsAnswers,
        };
      }

      // All IPs are private (no public IPs to use)
      // Generic error message - details in dns_answers for audit
      return {
        ok: false,
        error: 'DNS resolved to blocked addresses',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_DNS_RESOLVED_PRIVATE,
        dns_answers: dnsAnswers,
      };
    }

    const safeAddresses = [...safeIpv6, ...safeIpv4]; // Prefer IPv6

    if (safeAddresses.length === 0) {
      return {
        ok: false,
        error: 'All resolved addresses were blocked by policy',
        code: SAFE_FETCH_ERROR_CODES.E_SSRF_ALL_IPS_BLOCKED,
        dns_answers: dnsAnswers,
      };
    }

    // Select first safe address (IPv6 preferred per RFC 8305)
    return {
      ok: true,
      addresses: safeAddresses,
      selectedAddress: safeAddresses[0],
      ipv4Addresses: safeIpv4,
      ipv6Addresses: safeIpv6,
    };
  } catch (err) {
    // Generic error message - no internal details
    return {
      ok: false,
      error: 'DNS resolution failed',
      code: SAFE_FETCH_ERROR_CODES.E_DNS_RESOLUTION_FAILED,
    };
  }
}

/**
 * Attempt connection with Happy Eyeballs-style fallback (RFC 8305)
 * Properly cancels and cleans up the losing attempt
 * @internal
 */
export async function attemptWithFallback(
  url: string,
  dnsResult: DnsResolutionResult,
  httpClient: HttpClient,
  options: SafeFetchOptions
): Promise<{ response: Response; close: () => Promise<void> }> {
  const timeoutMs = options.timeoutMs ?? 30000; // DEFAULT_TIMEOUT_MS
  const { ipv6Addresses, ipv4Addresses } = dnsResult;

  // If we only have one family, just use it
  if (ipv6Addresses.length === 0 || ipv4Addresses.length === 0) {
    return httpClient.fetch(url, dnsResult.selectedAddress, {
      ...options,
      timeoutMs,
    });
  }

  // Track all pending attempts so we can clean up losers
  type AttemptResult = { response: Response; close: () => Promise<void> };
  const attempts: Array<{
    promise: Promise<AttemptResult>;
    cleanupOnLose: () => Promise<void>;
    settled: boolean;
  }> = [];

  // Helper to create an attempt that can be cleaned up
  const createAttempt = (ip: string, attemptTimeoutMs: number) => {
    let result: AttemptResult | null = null;
    let settled = false;

    const promise = httpClient
      .fetch(url, ip, {
        ...options,
        timeoutMs: attemptTimeoutMs,
      })
      .then((r) => {
        result = r;
        settled = true;
        return r;
      })
      .catch((err) => {
        settled = true;
        throw err;
      });

    const cleanupOnLose = async () => {
      // If this attempt completed, close its agent
      if (result) {
        await result.close();
      }
      // If still pending, the agent will be cleaned up when it eventually settles
      // (the httpClient handles cleanup on error)
    };

    return {
      promise,
      cleanupOnLose,
      get settled() {
        return settled;
      },
    };
  };

  // Define types for Promise.race results
  type RaceSuccess = { winner: 'ipv6' | 'ipv4'; result: AttemptResult };
  type RaceTimeout = { winner: 'timeout' };
  type RaceFailed = { winner: 'ipv6_failed' | 'ipv4_failed' };
  type FirstAttemptRaceResult = RaceSuccess | RaceTimeout | RaceFailed;

  // Start IPv6 attempt first (RFC 8305)
  const ipv6Attempt = createAttempt(ipv6Addresses[0], timeoutMs);
  attempts.push(ipv6Attempt);

  // Wait for either IPv6 success or first-attempt timeout
  const firstAttemptResult: FirstAttemptRaceResult = await Promise.race([
    ipv6Attempt.promise.then((r): RaceSuccess => ({ winner: 'ipv6', result: r })),
    new Promise<RaceTimeout>((resolve) =>
      setTimeout(() => resolve({ winner: 'timeout' }), HAPPY_EYEBALLS_FIRST_TIMEOUT_MS)
    ),
    ipv6Attempt.promise.then(
      (): never => {
        throw new Error('should not reach');
      },
      (): RaceFailed => ({ winner: 'ipv6_failed' })
    ),
  ]);

  if (firstAttemptResult.winner === 'ipv6' && 'result' in firstAttemptResult) {
    // IPv6 won quickly, no cleanup needed
    return firstAttemptResult.result;
  }

  // IPv6 either timed out or failed, start IPv4 attempt
  const ipv4Attempt = createAttempt(ipv4Addresses[0], timeoutMs - HAPPY_EYEBALLS_FIRST_TIMEOUT_MS);
  attempts.push(ipv4Attempt);

  // Race both attempts (IPv6 may still complete)
  try {
    const raceResult = await Promise.race([
      ipv6Attempt.promise.then((r) => ({ winner: 'ipv6' as const, result: r })),
      ipv4Attempt.promise.then((r) => ({ winner: 'ipv4' as const, result: r })),
    ]);

    // Clean up the losing attempt
    if (raceResult.winner === 'ipv6') {
      // IPv6 won, clean up IPv4
      ipv4Attempt.cleanupOnLose().catch(() => {});
    } else {
      // IPv4 won, clean up IPv6
      ipv6Attempt.cleanupOnLose().catch(() => {});
    }

    return raceResult.result;
  } catch (firstError) {
    // One failed, wait for the other
    try {
      const otherAttempt = ipv6Attempt.settled ? ipv4Attempt : ipv6Attempt;
      return await otherAttempt.promise;
    } catch {
      // Both failed, throw the original error
      throw firstError;
    }
  }
}

// -----------------------------------------------------------------------------
// Response Body Processing with Size Limits
// -----------------------------------------------------------------------------

/**
 * Read response body with size limit enforcement
 * @internal
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<{ ok: true; body: ArrayBuffer } | { ok: false; error: string; code: string }> {
  // Check Content-Length header first (optimization)
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      return {
        ok: false,
        error: `Response too large: ${length} bytes (max: ${maxBytes})`,
        code: SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE,
      };
    }
  }

  // Stream the body with size limit
  const reader = response.body?.getReader();
  if (!reader) {
    // No body, return empty
    return { ok: true, body: new ArrayBuffer(0) };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          error: `Response too large: exceeded ${maxBytes} bytes`,
          code: SAFE_FETCH_ERROR_CODES.E_RESPONSE_TOO_LARGE,
        };
      }

      chunks.push(value);
    }

    // Concatenate chunks
    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return { ok: true, body: result.buffer };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read response body: ${err instanceof Error ? err.message : String(err)}`,
      code: SAFE_FETCH_ERROR_CODES.E_NETWORK_ERROR,
    };
  }
}

// -----------------------------------------------------------------------------
// Audit Infrastructure
// -----------------------------------------------------------------------------

/**
 * Per-request audit context for tracking request-scoped counters
 *
 * All counters in this context are specific to a single safeFetch invocation.
 * This ensures evidence accurately reflects the state of that specific request,
 * not global process state.
 *
 * @internal
 */
export interface RequestAuditContext {
  /** Number of events currently pending for this request */
  pending: number;
  /** Number of events dropped for this request */
  dropped: number;
  /** Number of hook errors for this request */
  hookErrors: number;
  /** Number of hook errors suppressed for this request */
  hookSuppressed: number;
}

/**
 * Create a new request-scoped audit context
 * @internal
 */
export function createRequestAuditContext(): RequestAuditContext {
  return {
    pending: 0,
    dropped: 0,
    hookErrors: 0,
    hookSuppressed: 0,
  };
}

/**
 * Module-global pending count for bounded queue enforcement
 * (Rate limiting needs global state, but evidence uses request-scoped counters)
 * @internal
 */
let globalPendingCount = 0;

/**
 * Rate limit for overflow and hook error events (1 per second max, global)
 * Rate limiting must be global to prevent log spam across concurrent requests.
 */
const OVERFLOW_EVENT_INTERVAL_MS = 1000;
let lastOverflowEventTime = 0;
let lastHookErrorEventTime = 0;

/**
 * Reset audit queue statistics (for testing)
 * @internal
 */
export function resetAuditQueueStats(): void {
  globalPendingCount = 0;
  lastOverflowEventTime = 0;
  lastHookErrorEventTime = 0;
}

/**
 * Get global audit queue statistics for monitoring (process-level)
 *
 * NOTE: For per-request stats, use the RequestAuditContext.
 * This function returns process-level totals for operational monitoring.
 *
 * @returns Object with global pending count
 */
export function getAuditQueueStats(): { pending: number; dropped: number } {
  return {
    pending: globalPendingCount,
    dropped: 0, // Deprecated: use RequestAuditContext.dropped for per-request
  };
}

/**
 * Sanitize error message to prevent leaking sensitive data
 * @internal
 */
function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Truncate to prevent DoS via huge error messages
  const truncated = raw.length > 200 ? raw.slice(0, 200) + '...' : raw;
  // Redact potential secrets (tokens, keys, passwords)
  return truncated
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/token[=:]\s*["']?[A-Za-z0-9\-._~+/]+["']?/gi, 'token=[REDACTED]')
    .replace(/key[=:]\s*["']?[A-Za-z0-9\-._~+/]+["']?/gi, 'key=[REDACTED]')
    .replace(/password[=:]\s*["']?[^\s"']+["']?/gi, 'password=[REDACTED]')
    .replace(/secret[=:]\s*["']?[A-Za-z0-9\-._~+/]+["']?/gi, 'secret=[REDACTED]');
}

// SAFE_FETCH_EVENT_SCHEMA_VERSION is imported from constants.ts

/**
 * Safely emit an audit event via microtask for performance isolation
 *
 * Events are queued via queueMicrotask to prevent slow hooks from blocking
 * the request path. Ordering is guaranteed within a request but may
 * interleave with other async operations.
 *
 * P1.4: Implements bounded queue to prevent microtask blowup.
 * Events are dropped (not queued) if MAX_PENDING_AUDIT_EVENTS is exceeded.
 * When drops occur, a rate-limited `audit_overflow` event is emitted.
 *
 * @param ctx - Request-scoped audit context for tracking per-request counters
 * @internal
 */
export function emitAuditEvent(
  ctx: RequestAuditContext,
  hook: SafeFetchAuditHook | undefined,
  sanitizer: ((message: string) => string) | 'off' | undefined,
  hookName: string,
  event: Omit<SafeFetchEvent, 'schema_version'>
): void {
  if (!hook) return;

  // P1.4: Bounded queue - drop events if too many pending (global limit)
  if (globalPendingCount >= MAX_PENDING_AUDIT_EVENTS) {
    const wasFirstDrop = ctx.dropped === 0;
    ctx.dropped++;

    // Emit rate-limited overflow event (max 1 per second, global rate limit)
    const now = Date.now();
    if (wasFirstDrop || now - lastOverflowEventTime >= OVERFLOW_EVENT_INTERVAL_MS) {
      lastOverflowEventTime = now;
      // Direct call to hook (not queued) to ensure delivery
      try {
        hook({
          schema_version: SAFE_FETCH_EVENT_SCHEMA_VERSION,
          type: 'audit_overflow',
          timestamp: now,
          url: event.url ?? '[unknown]',
          meta: {
            dropped_total: ctx.dropped,
            pending: globalPendingCount,
            max_pending: MAX_PENDING_AUDIT_EVENTS,
          },
        });
      } catch {
        // Audit hooks MUST NOT throw - silently ignore errors
      }
    }
    return;
  }

  // Add schema version to event
  const fullEvent: SafeFetchEvent = {
    schema_version: SAFE_FETCH_EVENT_SCHEMA_VERSION,
    ...event,
  };

  // Track pending count (both global for rate limiting and per-request for evidence)
  globalPendingCount++;
  ctx.pending++;

  // Use queueMicrotask for performance isolation
  // This prevents slow hooks from blocking the request path
  queueMicrotask(() => {
    try {
      hook(fullEvent);
    } catch (err) {
      // Audit hooks MUST NOT throw - but we emit a rate-limited error event
      // to provide observability without recursion risk
      ctx.hookErrors++;

      // EXPLICIT NON-RECURSION GUARD: Never emit audit_hook_error for
      // an audit_hook_error event. This prevents infinite loops when the
      // error handler itself throws.
      if (fullEvent.type === 'audit_hook_error') {
        // Silently swallow - we already tried to report an error and it failed
        ctx.hookSuppressed++;
        return;
      }

      const now = Date.now();

      // Rate limiting: emit at most 1 error event per second (global rate limit)
      // This is concurrency-safe because we check-then-set atomically in JS
      // (single-threaded event loop, no true parallelism within microtask)
      if (now - lastHookErrorEventTime >= OVERFLOW_EVENT_INTERVAL_MS) {
        lastHookErrorEventTime = now;
        // Direct synchronous call - inner try/catch prevents recursion if
        // the error handler itself throws
        try {
          hook({
            schema_version: SAFE_FETCH_EVENT_SCHEMA_VERSION,
            type: 'audit_hook_error',
            timestamp: now,
            url: fullEvent.url ?? '[unknown]',
            meta: {
              // Sanitized error message (configurable via sanitizer option)
              // Custom sanitizers are wrapped in try/catch for safety
              error_message: (() => {
                const rawMsg = err instanceof Error ? err.message : String(err);
                if (sanitizer === 'off') return rawMsg;
                if (typeof sanitizer === 'function') {
                  try {
                    return sanitizer(rawMsg);
                  } catch {
                    // Custom sanitizer threw - fall back to built-in
                    return sanitizeErrorMessage(err);
                  }
                }
                return sanitizeErrorMessage(err);
              })(),
              error_count: ctx.hookErrors,
              // Structured fields for observability
              hook_name: hookName,
              error_code: err instanceof Error && 'code' in err ? String(err.code) : undefined,
              original_event_type: fullEvent.type,
              suppressed_count: ctx.hookSuppressed,
            },
          });
        } catch {
          // If error event hook also throws, silently ignore.
          // This is a second line of defense; the primary guard above
          // (checking fullEvent.type === 'audit_hook_error') prevents
          // re-entering this path entirely.
        }
      } else {
        // Rate limited - track suppressed errors for observability (per-request)
        ctx.hookSuppressed++;
      }
    } finally {
      // Decrement pending counts after processing
      globalPendingCount--;
      ctx.pending--;
    }
  });
}

/**
 * Sanitize URL for logging (remove credentials)
 * @internal
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove username and password
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // If URL is malformed, return a generic placeholder
    return '[invalid-url]';
  }
}
