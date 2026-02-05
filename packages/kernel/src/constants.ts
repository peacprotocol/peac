/**
 * PEAC Protocol Constants
 * Derived from specs/kernel/constants.json
 *
 * NOTE: This file is manually synced for v0.9.15.
 * From v0.9.16+, this will be auto-generated via codegen.
 */

/**
 * Wire format type for PEAC receipts
 * Normalized to peac-receipt/0.1 per DEC-20260114-002
 */
export const WIRE_TYPE = 'peac-receipt/0.1' as const;

/**
 * Wire format version (extracted from WIRE_TYPE)
 * Use this for wire_version fields in receipts
 */
export const WIRE_VERSION = '0.1' as const;

/**
 * Supported cryptographic algorithms
 */
export const ALGORITHMS = {
  supported: ['EdDSA'] as const,
  default: 'EdDSA' as const,
} as const;

/**
 * HTTP header names for PEAC protocol
 */
export const HEADERS = {
  receipt: 'PEAC-Receipt' as const,
  receiptPointer: 'PEAC-Receipt-Pointer' as const,
  dpop: 'DPoP' as const,
  // Purpose headers (v0.9.24+)
  purpose: 'PEAC-Purpose' as const,
  purposeApplied: 'PEAC-Purpose-Applied' as const,
  purposeReason: 'PEAC-Purpose-Reason' as const,
} as const;

/**
 * Policy manifest settings (/.well-known/peac.txt)
 *
 * Policy documents declare access terms for agents and gateways.
 * @see docs/specs/PEAC-TXT.md
 */
export const POLICY = {
  manifestPath: '/.well-known/peac.txt' as const,
  fallbackPath: '/peac.txt' as const,
  manifestVersion: 'peac-policy/0.1' as const,
  cacheTtlSeconds: 3600,
  maxBytes: 262144, // 256 KiB
  maxDepth: 8,
} as const;

/**
 * Issuer configuration settings (/.well-known/peac-issuer.json)
 *
 * Issuer config enables verifiers to discover JWKS and verification endpoints.
 * @see docs/specs/PEAC-ISSUER.md
 */
export const ISSUER_CONFIG = {
  configPath: '/.well-known/peac-issuer.json' as const,
  configVersion: 'peac-issuer/0.1' as const,
  cacheTtlSeconds: 3600,
  maxBytes: 65536, // 64 KiB
  maxDepth: 4,
  fetchTimeoutMs: 10000,
} as const;

/**
 * @deprecated Use POLICY instead. Will be removed in v1.0.
 */
export const DISCOVERY = {
  manifestPath: POLICY.manifestPath,
  manifestVersion: 'peac/0.9' as const,
  cacheTtlSeconds: POLICY.cacheTtlSeconds,
} as const;

/**
 * JWKS rotation and revocation settings
 */
export const JWKS = {
  rotationDays: 90,
  overlapDays: 7,
  emergencyRevocationHours: 24,
} as const;

/**
 * Receipt validation constants
 */
export const RECEIPT = {
  minReceiptIdLength: 16,
  maxReceiptIdLength: 64,
  defaultTtlSeconds: 86400, // 24 hours
} as const;

/**
 * Payment amount validation limits (in cents/smallest currency unit)
 */
export const LIMITS = {
  maxAmountCents: 999999999999,
  minAmountCents: 1,
} as const;

/**
 * Bundle format version.
 * Used in dispute bundles, audit bundles, and archive bundles.
 */
export const BUNDLE_VERSION = 'peac-bundle/0.1' as const;

/**
 * Verification report format version.
 */
export const VERIFICATION_REPORT_VERSION = 'peac-verification-report/0.1' as const;

/**
 * Hash format constants and utilities.
 * All hashes use the self-describing format: sha256:<64 lowercase hex chars>
 */
export const HASH = {
  /** Canonical hash algorithm */
  algorithm: 'sha256' as const,

  /** Hash prefix pattern */
  prefix: 'sha256:' as const,

  /** Valid hash regex: sha256:<64 lowercase hex> */
  pattern: /^sha256:[0-9a-f]{64}$/,

  /** Hex-only pattern for legacy comparison */
  hexPattern: /^[0-9a-f]{64}$/,
};

/**
 * Parse a sha256:<hex> hash string into components.
 * Returns null if the format is invalid.
 *
 * @param hash - Hash string to parse (e.g., "sha256:abc123...")
 * @returns Parsed hash or null if invalid
 */
export function parseHash(hash: string): { alg: 'sha256'; hex: string } | null {
  if (!HASH.pattern.test(hash)) {
    return null;
  }
  return {
    alg: 'sha256',
    hex: hash.slice(7), // Remove 'sha256:' prefix
  };
}

/**
 * Format a hex string as a sha256:<hex> hash.
 * Validates that the hex is exactly 64 lowercase characters.
 *
 * @param hex - Hex string (64 lowercase characters)
 * @returns Formatted hash or null if invalid
 */
export function formatHash(hex: string): string | null {
  if (!HASH.hexPattern.test(hex)) {
    return null;
  }
  return `sha256:${hex}`;
}

/**
 * Validate a hash string is in the correct format.
 *
 * @param hash - Hash string to validate
 * @returns true if valid sha256:<64 hex> format
 */
export function isValidHash(hash: string): boolean {
  return HASH.pattern.test(hash);
}

/**
 * Verifier security limits per VERIFIER-SECURITY-MODEL.md
 */
export const VERIFIER_LIMITS = {
  /** Maximum receipt size in bytes (256 KB) */
  maxReceiptBytes: 262144,
  /** Maximum number of claims in a receipt */
  maxClaimsCount: 100,
  /** Maximum extension size in bytes (64 KB) */
  maxExtensionBytes: 65536,
  /** Maximum string length for individual claims (64 KB) */
  maxStringLength: 65536,
  /** Maximum JWKS document size in bytes (64 KB) */
  maxJwksBytes: 65536,
  /** Maximum number of keys in a JWKS */
  maxJwksKeys: 20,
  /** Maximum individual key size in bytes */
  maxKeySize: 4096,
  /** Network fetch timeout in milliseconds */
  fetchTimeoutMs: 5000,
  /** Maximum number of redirects to follow */
  maxRedirects: 3,
  /** Maximum network response size in bytes (256 KB) */
  maxResponseBytes: 262144,
} as const;

/**
 * Verifier network security settings per VERIFIER-SECURITY-MODEL.md
 */
export const VERIFIER_NETWORK = {
  /** Only allow HTTPS URLs */
  httpsOnly: true,
  /** Block requests to private IP ranges */
  blockPrivateIps: true,
  /** Default redirect policy (false = no redirects) */
  allowRedirects: false,
} as const;

/**
 * Private IPv4 CIDR blocks to block for SSRF protection
 */
export const PRIVATE_IP_RANGES = {
  /** RFC 1918 private ranges */
  rfc1918: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'] as const,
  /** Link-local addresses */
  linkLocal: ['169.254.0.0/16'] as const,
  /** Loopback addresses */
  loopback: ['127.0.0.0/8'] as const,
  /** IPv6 loopback */
  ipv6Loopback: ['::1/128'] as const,
  /** IPv6 link-local */
  ipv6LinkLocal: ['fe80::/10'] as const,
} as const;

/**
 * Verifier policy version
 */
export const VERIFIER_POLICY_VERSION = 'peac-verifier-policy/0.1' as const;

/**
 * Verification modes per VERIFIER-SECURITY-MODEL.md
 */
export const VERIFICATION_MODES = {
  /** All verification in browser/client, may fetch JWKS */
  clientSide: 'client_side' as const,
  /** No network access, uses bundled/pinned keys */
  offlineOnly: 'offline_only' as const,
  /** Prefer offline, fallback to network */
  offlinePreferred: 'offline_preferred' as const,
  /** Allow network fetches for key discovery */
  networkAllowed: 'network_allowed' as const,
} as const;

/**
 * All constants export
 */
export const CONSTANTS = {
  WIRE_TYPE,
  WIRE_VERSION,
  ALGORITHMS,
  HEADERS,
  DISCOVERY,
  JWKS,
  RECEIPT,
  LIMITS,
  BUNDLE_VERSION,
  VERIFICATION_REPORT_VERSION,
  HASH,
  VERIFIER_LIMITS,
  VERIFIER_NETWORK,
  VERIFIER_POLICY_VERSION,
  VERIFICATION_MODES,
} as const;
