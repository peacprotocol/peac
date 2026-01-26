/**
 * SSRF Policy Types and Validation
 *
 * Local definitions for SSRF protection configuration.
 * These types are specific to @peac/net-node's SSRF protection.
 *
 * @internal
 * @module @peac/net-node/ssrf
 */

/**
 * Acknowledgment constant for allowing dangerous CIDR ranges
 *
 * When policy.allowCidrs contains private/dangerous ranges,
 * this acknowledgment must be set to confirm intentional usage.
 */
export const ALLOW_DANGEROUS_CIDRS_ACK =
  'I_UNDERSTAND_ALLOWING_PRIVATE_CIDRS_IS_DANGEROUS' as const;

/**
 * SSRF policy configuration
 *
 * Controls how SSRF protection handles URLs and IP addresses.
 */
export interface SSRFPolicy {
  /**
   * Additional CIDR ranges to ALLOW (bypass blocking).
   * Use with extreme caution - only for trusted internal services.
   * Requires ack_allow_dangerous_cidrs if ranges overlap with private/dangerous IPs.
   */
  allowCidrs?: string[];

  /**
   * Additional CIDR ranges to BLOCK (in addition to default private ranges).
   * Applied after allowCidrs.
   */
  blockedCidrs?: string[];

  /**
   * Acknowledgment for allowing dangerous CIDR ranges.
   * Required when allowCidrs contains private/dangerous ranges.
   * Must be exactly ALLOW_DANGEROUS_CIDRS_ACK to be valid.
   */
  ack_allow_dangerous_cidrs?: string;

  /**
   * Allow CGNAT (Carrier-Grade NAT) range: 100.64.0.0/10
   * Use with caution - requires explicit acknowledgment.
   */
  allowCgnat?: boolean;

  /**
   * Acknowledgment for allowing CGNAT range.
   * Required when allowCgnat is true.
   */
  ack_allow_cgnat?: string;

  /**
   * Require HTTPS (default true). Set to false to allow HTTP URLs.
   * @default true
   */
  requireHttps?: boolean;

  /**
   * Allow IP literals in URLs (default false).
   * When false, only hostnames are allowed (not direct IP addresses).
   * @default false
   */
  allowIPLiterals?: boolean;

  /**
   * Allowed ports (default [80, 443]).
   * Only these ports are allowed in URLs. Other ports are blocked.
   */
  allowPorts?: number[];

  /**
   * Allow credentials in URLs (default false).
   * When false, URLs with username:password are rejected.
   * @default false
   */
  allowCredentials?: boolean;
}

/**
 * Default SSRF policy - blocks all private IP ranges
 */
export const DEFAULT_SSRF_POLICY: SSRFPolicy = {
  allowCidrs: [],
  blockedCidrs: [],
};

/**
 * Result of URL validation for SSRF
 */
export type UrlValidationResult =
  | { ok: true; value: URL }
  | { ok: false; code: string; error: string };

/**
 * RFC 1918 private IPv4 ranges and localhost
 */
const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private (172.16-31.x.x)
  /^192\.168\./, // Class C private
  /^0\./, // "This network"
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT 100.64.0.0/10
  /^169\.254\./, // Link-local
  /^192\.0\.0\./, // IETF protocol assignments
  /^192\.0\.2\./, // TEST-NET-1
  /^198\.51\.100\./, // TEST-NET-2
  /^203\.0\.113\./, // TEST-NET-3
  /^192\.88\.99\./, // 6to4 relay anycast
  /^198\.18\./, // Benchmark testing
  /^224\./, // Multicast
  /^240\./, // Reserved (future use)
  /^255\.255\.255\.255$/, // Broadcast
];

/**
 * Check if a hostname looks like a private IPv4 address
 */
function isPrivateIPv4Literal(hostname: string): boolean {
  // Check if it looks like an IPv4 address
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false;
  }
  return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Check if a hostname is localhost or a loopback address
 */
function isLoopback(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === 'localhost.' ||
    lower.endsWith('.localhost') ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower === '::1'
  );
}

/**
 * Check if a hostname is an IP literal (IPv4 or IPv6)
 */
function isIPLiteral(hostname: string): boolean {
  // IPv4 pattern
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  // IPv6 pattern (bracketed or not)
  if (hostname.startsWith('[') || hostname.includes(':')) {
    return true;
  }
  return false;
}

/**
 * Validate a URL string for SSRF protection (string-level checks only)
 *
 * This performs URL parsing and basic string-level validation.
 * NOTE: This is NOT sufficient for full SSRF protection - DNS resolution
 * and IP validation must also be performed at connection time.
 *
 * @param urlString - The URL to validate
 * @param policy - SSRF policy (affects which checks are applied)
 * @returns Validation result with parsed URL or error
 */
export function validateUrlForSSRF(urlString: string, policy?: SSRFPolicy): UrlValidationResult {
  // Step 1: Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return {
      ok: false,
      code: 'E_NET_SSRF_INVALID_URL',
      error: 'Invalid URL format',
    };
  }

  // Step 2: Protocol validation - only https allowed by default (http is risky)
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return {
      ok: false,
      code: 'E_NET_SSRF_INVALID_PROTOCOL',
      error: `Protocol ${parsedUrl.protocol} not allowed`,
    };
  }

  // Step 3: Block HTTP by default unless policy allows (requireHttps: false)
  const requireHttps = policy?.requireHttps !== false; // default true
  if (parsedUrl.protocol === 'http:' && requireHttps) {
    return {
      ok: false,
      code: 'E_NET_SSRF_HTTP_BLOCKED',
      error: 'HTTP protocol blocked - use HTTPS',
    };
  }

  // Step 4: Basic hostname validation
  const hostname = parsedUrl.hostname;
  if (!hostname || hostname.length === 0) {
    return {
      ok: false,
      code: 'E_NET_SSRF_INVALID_HOST',
      error: 'Empty hostname',
    };
  }

  // Step 5: Check for IPv6 zone IDs (security risk)
  if (hostname.includes('%')) {
    return {
      ok: false,
      code: 'E_NET_SSRF_IPV6_ZONE_ID',
      error: 'IPv6 zone IDs not allowed',
    };
  }

  // Step 6: Block localhost/loopback
  if (isLoopback(hostname)) {
    return {
      ok: false,
      code: 'E_NET_SSRF_LOCALHOST_BLOCKED',
      error: 'Localhost/loopback addresses not allowed',
    };
  }

  // Step 7: Block private IPv4 literals (unless policy allows)
  if (isPrivateIPv4Literal(hostname)) {
    // Check if policy explicitly allows this CIDR
    const allowed = policy?.allowCidrs?.some((cidr) => {
      // Simple check - if any allowCidr is set, we let DNS-level validation handle it
      return cidr.length > 0;
    });
    if (!allowed) {
      return {
        ok: false,
        code: 'E_NET_SSRF_PRIVATE_IP_BLOCKED',
        error: 'Private IP addresses not allowed',
      };
    }
  }

  // Step 8: Block IP literals by default unless policy allows
  const allowIPLiterals = policy?.allowIPLiterals === true;
  if (isIPLiteral(hostname) && !allowIPLiterals) {
    return {
      ok: false,
      code: 'E_NET_SSRF_IP_LITERAL_BLOCKED',
      error: 'IP literals not allowed - use hostnames',
    };
  }

  // Step 9: Block credentials in URLs by default
  const allowCredentials = policy?.allowCredentials === true;
  if (!allowCredentials && (parsedUrl.username || parsedUrl.password)) {
    return {
      ok: false,
      code: 'E_NET_SSRF_CREDENTIALS_BLOCKED',
      error: 'Credentials in URLs not allowed',
    };
  }

  // Step 10: Port validation - only allow standard ports by default
  // allowPorts is ADDITIVE to the default [80, 443]
  const defaultPorts = [80, 443];
  const additionalPorts = policy?.allowPorts ?? [];
  const allowedPorts = [...new Set([...defaultPorts, ...additionalPorts])];
  const portStr = parsedUrl.port;
  const effectivePort = portStr
    ? parseInt(portStr, 10)
    : parsedUrl.protocol === 'https:'
      ? 443
      : 80;

  if (!allowedPorts.includes(effectivePort)) {
    return {
      ok: false,
      code: 'E_NET_SSRF_PORT_BLOCKED',
      error: `Port ${effectivePort} not allowed`,
    };
  }

  return { ok: true, value: parsedUrl };
}

/**
 * Error codes for trust boundary violations
 *
 * Used for SSRF-related errors in safeFetch operations.
 */
export const TRUST_ERROR_CODES = {
  SSRF_URL_REJECTED: 'E_NET_SSRF_URL_REJECTED',
  SSRF_DNS_RESOLVED_PRIVATE: 'E_NET_SSRF_DNS_RESOLVED_PRIVATE',
  SSRF_ALL_IPS_BLOCKED: 'E_NET_SSRF_ALL_IPS_BLOCKED',
  SSRF_REDIRECT_BLOCKED: 'E_NET_SSRF_REDIRECT_BLOCKED',
  SSRF_TOO_MANY_REDIRECTS: 'E_NET_SSRF_TOO_MANY_REDIRECTS',
  SSRF_IPV6_ZONE_ID: 'E_NET_SSRF_IPV6_ZONE_ID',
  SSRF_INVALID_HOST: 'E_NET_SSRF_INVALID_HOST',
} as const;
