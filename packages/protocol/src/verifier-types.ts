/**
 * PEAC Verifier Types
 *
 * Types for verification policy, trust pinning, and verification reports
 * per VERIFIER-SECURITY-MODEL.md, TRUST-PINNING-POLICY.md, and
 * VERIFICATION-REPORT-FORMAT.md
 *
 * @packageDocumentation
 */

import {
  VERIFIER_LIMITS,
  VERIFIER_NETWORK,
  VERIFIER_POLICY_VERSION,
  VERIFICATION_REPORT_VERSION,
} from '@peac/kernel';

// ---------------------------------------------------------------------------
// Verification Mode
// ---------------------------------------------------------------------------

/**
 * Verification mode per VERIFIER-SECURITY-MODEL.md
 */
export type VerificationMode = 'offline_only' | 'offline_preferred' | 'network_allowed';

// ---------------------------------------------------------------------------
// Trust Pinning
// ---------------------------------------------------------------------------

/**
 * Pinned key entry per TRUST-PINNING-POLICY.md
 *
 * Uses RFC 7638 JWK Thumbprint with base64url encoding (NOT hex).
 * SHA-256 thumbprints are 43 characters in base64url.
 *
 * For offline verification, include either `public_key` (base64url 32 bytes)
 * or the full `jwk` object. If only thumbprint is provided, the key can only
 * be pin-checked after fetching JWKS (requires network mode).
 */
export interface PinnedKey {
  /** Issuer origin (https://host[:port]) */
  issuer: string;
  /** Key identifier (kid from JWKS) */
  kid: string;
  /** RFC 7638 JWK Thumbprint, SHA-256, base64url-encoded (43 chars) */
  jwk_thumbprint_sha256: string;
  /**
   * Ed25519 public key bytes, base64url-encoded (43 chars for 32 bytes).
   * If provided, enables offline verification without JWKS fetch.
   */
  public_key?: string;
  /**
   * Full JWK for offline verification.
   * If provided, enables offline verification without JWKS fetch.
   * Takes precedence over public_key.
   */
  jwk?: {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid?: string;
  };
}

/**
 * Issuer allowlist entry
 *
 * Full origin format: https://host[:port]
 * The port is only included if non-standard (not 443 for HTTPS).
 */
export type IssuerOrigin = string;

// ---------------------------------------------------------------------------
// Verifier Limits
// ---------------------------------------------------------------------------

/**
 * Verifier security limits
 */
export interface VerifierLimits {
  /** Maximum receipt size in bytes */
  max_receipt_bytes: number;
  /** Maximum JWKS document size in bytes */
  max_jwks_bytes: number;
  /** Maximum number of keys in a JWKS */
  max_jwks_keys: number;
  /** Maximum redirects to follow */
  max_redirects: number;
  /** Network fetch timeout in milliseconds */
  fetch_timeout_ms: number;
  /** Maximum extension size in bytes */
  max_extension_bytes: number;
}

/**
 * Default verifier limits from VERIFIER-SECURITY-MODEL.md
 */
export const DEFAULT_VERIFIER_LIMITS: VerifierLimits = {
  max_receipt_bytes: VERIFIER_LIMITS.maxReceiptBytes,
  max_jwks_bytes: VERIFIER_LIMITS.maxJwksBytes,
  max_jwks_keys: VERIFIER_LIMITS.maxJwksKeys,
  max_redirects: VERIFIER_LIMITS.maxRedirects,
  fetch_timeout_ms: VERIFIER_LIMITS.fetchTimeoutMs,
  max_extension_bytes: VERIFIER_LIMITS.maxExtensionBytes,
};

// ---------------------------------------------------------------------------
// Network Security
// ---------------------------------------------------------------------------

/**
 * Network security settings
 */
export interface NetworkSecurity {
  /** Only allow HTTPS URLs */
  https_only: boolean;
  /** Block requests to private IP ranges */
  block_private_ips: boolean;
  /** Allow redirects */
  allow_redirects: boolean;
  /**
   * Allow cross-origin redirects (default: true for CDN compatibility).
   * When true, redirects to different origins are allowed if they pass SSRF checks.
   * When false, only same-origin redirects are allowed.
   */
  allow_cross_origin_redirects?: boolean;
  /**
   * Behavior on DNS resolution failure (default: 'block' for security).
   * - 'block': Treat DNS failure as blocked (fail-closed, more secure)
   * - 'fail': Return fetch error (allows retry, less restrictive)
   */
  dns_failure_behavior?: 'block' | 'fail';
}

/**
 * Default network security settings from VERIFIER-SECURITY-MODEL.md
 */
export const DEFAULT_NETWORK_SECURITY: NetworkSecurity = {
  https_only: VERIFIER_NETWORK.httpsOnly,
  block_private_ips: VERIFIER_NETWORK.blockPrivateIps,
  allow_redirects: VERIFIER_NETWORK.allowRedirects,
  allow_cross_origin_redirects: true, // Allow for CDN compatibility
  dns_failure_behavior: 'block', // Fail-closed by default
};

// ---------------------------------------------------------------------------
// Verifier Policy
// ---------------------------------------------------------------------------

/**
 * Verifier policy configuration
 *
 * This structure echoes the policy used for verification, making trust
 * decisions auditable per VERIFICATION-REPORT-FORMAT.md.
 */
export interface VerifierPolicy {
  /** Policy schema version */
  policy_version: typeof VERIFIER_POLICY_VERSION;
  /** Verification mode */
  mode: VerificationMode;
  /** Allowed issuer origins (optional, if empty all issuers allowed) */
  issuer_allowlist?: IssuerOrigin[];
  /** Pinned keys for offline verification */
  pinned_keys?: PinnedKey[];
  /** Effective security limits */
  limits: VerifierLimits;
  /** Network security settings */
  network: NetworkSecurity;
}

/**
 * Create a default verifier policy
 */
export function createDefaultPolicy(mode: VerificationMode): VerifierPolicy {
  return {
    policy_version: VERIFIER_POLICY_VERSION,
    mode,
    limits: { ...DEFAULT_VERIFIER_LIMITS },
    network: { ...DEFAULT_NETWORK_SECURITY },
  };
}

// ---------------------------------------------------------------------------
// Verification Checks
// ---------------------------------------------------------------------------

/**
 * Check status
 */
export type CheckStatus = 'pass' | 'fail' | 'skip';

/**
 * Standard check IDs per VERIFIER-SECURITY-MODEL.md (in order)
 */
export const CHECK_IDS = [
  'jws.parse',
  'limits.receipt_bytes',
  'jws.protected_header',
  'claims.schema_unverified',
  'issuer.trust_policy',
  'issuer.discovery',
  'key.resolve',
  'jws.signature',
  'claims.time_window',
  'extensions.limits',
  'transport.profile_binding',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/**
 * Single verification check result
 */
export interface CheckResult {
  /** Stable check identifier */
  id: CheckId;
  /** Check status */
  status: CheckStatus;
  /** Machine-readable details (optional) */
  detail?: Record<string, unknown>;
  /** Stable error code (if failed) */
  error_code?: string;
}

// ---------------------------------------------------------------------------
// Verification Report Input
// ---------------------------------------------------------------------------

/**
 * Input type for verification
 */
export type InputType = 'receipt_jws' | 'bundle_entry';

/**
 * Digest object (algorithm + value)
 */
export interface DigestObject {
  /** Hash algorithm */
  alg: 'sha-256';
  /** Hash value in lowercase hex */
  value: string;
}

/**
 * Bundle context for bundle_entry input type
 */
export interface BundleContext {
  /** Digest of bundle bytes */
  bundle_digest: DigestObject;
  /** 0-based entry index */
  entry_index: number;
  /** Stable entry ID (optional) */
  entry_id?: string;
}

/**
 * Verification input descriptor
 */
export interface VerificationInput {
  /** Input type */
  type: InputType;
  /** Digest of receipt bytes */
  receipt_digest: DigestObject;
  /** Bundle context (if type = bundle_entry) */
  bundle?: BundleContext;
}

// ---------------------------------------------------------------------------
// Verification Report Result
// ---------------------------------------------------------------------------

/**
 * Result severity
 */
export type ResultSeverity = 'info' | 'warning' | 'error';

/**
 * Reason codes per VERIFIER-SECURITY-MODEL.md
 */
export type ReasonCode =
  | 'ok'
  | 'receipt_too_large'
  | 'malformed_receipt'
  | 'signature_invalid'
  | 'issuer_not_allowed'
  | 'key_not_found'
  | 'key_fetch_blocked'
  | 'key_fetch_failed'
  | 'key_fetch_timeout'
  | 'pointer_fetch_blocked'
  | 'pointer_fetch_failed'
  | 'pointer_fetch_timeout'
  | 'pointer_fetch_too_large'
  | 'pointer_digest_mismatch'
  | 'jwks_too_large'
  | 'jwks_too_many_keys'
  | 'expired'
  | 'not_yet_valid'
  | 'audience_mismatch'
  | 'schema_invalid'
  | 'policy_violation'
  | 'extension_too_large'
  | 'invalid_transport';

/**
 * High-level verification result
 */
export interface VerificationResult {
  /** Overall verification result */
  valid: boolean;
  /** Stable reason code */
  reason: ReasonCode;
  /** Result severity */
  severity: ResultSeverity;
  /** Receipt wire format (e.g., peac-receipt/0.1) */
  receipt_type: string;
  /** Normalized issuer origin (optional) */
  issuer?: string;
  /** Key ID used for verification (optional) */
  kid?: string;
}

// ---------------------------------------------------------------------------
// Verification Report Artifacts
// ---------------------------------------------------------------------------

/**
 * Pointer resolution details
 */
export interface PointerArtifact {
  /** Pointer URL */
  url: string;
  /** Expected digest from header */
  expected_digest: DigestObject;
  /** Actual digest of fetched content */
  actual_digest?: DigestObject;
  /** Whether digests matched */
  digest_matched?: boolean;
}

/**
 * Key source for enterprise debuggability
 */
export type KeySource = 'pinned' | 'jwks_fetch';

/**
 * Additional verification artifacts
 *
 * Artifacts are divided into two categories:
 *
 * **Deterministic artifacts** (same inputs and policy -> same values):
 * - `issuer_key_source`: Always determined by policy and receipt
 * - `issuer_key_thumbprint`: Computed from the signing key
 * - `normalized_claims_digest`: Computed from the claims
 * - `receipt_pointer`: Derived from the input pointer header
 *
 * **Non-deterministic artifacts** (may vary based on runtime state):
 * - `issuer_jwks_digest`: Only present when JWKS is fetched fresh (not from cache)
 *
 * Use `buildDeterministic()` to exclude non-deterministic artifacts for
 * reproducible report generation.
 */
export interface VerificationArtifacts {
  /**
   * Digest of JWKS used for verification.
   *
   * NON-DETERMINISTIC: Only present when JWKS is fetched fresh (not from cache).
   * Excluded by `buildDeterministic()`.
   */
  issuer_jwks_digest?: DigestObject;
  /** Source of the signing key used for verification (DETERMINISTIC) */
  issuer_key_source?: KeySource;
  /** RFC 7638 JWK Thumbprint (SHA-256, base64url) of the key used (DETERMINISTIC) */
  issuer_key_thumbprint?: string;
  /** Digest of canonicalized claims (DETERMINISTIC) */
  normalized_claims_digest?: DigestObject;
  /** Pointer resolution details (DETERMINISTIC) */
  receipt_pointer?: PointerArtifact;
}

/**
 * Keys of artifacts that are non-deterministic (depend on runtime state)
 */
export const NON_DETERMINISTIC_ARTIFACT_KEYS: (keyof VerificationArtifacts)[] = [
  'issuer_jwks_digest',
];

// ---------------------------------------------------------------------------
// Verification Report Meta
// ---------------------------------------------------------------------------

/**
 * Verifier implementation info
 */
export interface VerifierInfo {
  /** Verifier name */
  name: string;
  /** Verifier version */
  version: string;
}

/**
 * Non-deterministic metadata (MUST be excluded from report hashes)
 */
export interface VerificationMeta {
  /** RFC 3339 timestamp when report was generated */
  generated_at?: string;
  /** Verifier implementation info */
  verifier?: VerifierInfo;
}

// ---------------------------------------------------------------------------
// Verification Report
// ---------------------------------------------------------------------------

/**
 * PEAC Verification Report per VERIFICATION-REPORT-FORMAT.md
 *
 * This report is designed to be:
 * - Portable: shareable across organizations
 * - Deterministic: reproducible given same inputs
 * - Safe: bounded resource usage
 * - Policy-aware: trust decisions are explicit
 */
export interface VerificationReport {
  /** Format version identifier (REQUIRED) */
  report_version: typeof VERIFICATION_REPORT_VERSION;
  /** What was verified (REQUIRED) */
  input: VerificationInput;
  /** Policy used for verification (REQUIRED) */
  policy: VerifierPolicy;
  /** High-level outcome (REQUIRED) */
  result: VerificationResult;
  /** Ordered list of checks (REQUIRED) */
  checks: CheckResult[];
  /** Additional outputs (OPTIONAL) */
  artifacts?: VerificationArtifacts;
  /** Non-deterministic fields (OPTIONAL, excluded from hashes) */
  meta?: VerificationMeta;
}

// ---------------------------------------------------------------------------
// Report Builder Utilities
// ---------------------------------------------------------------------------

/**
 * Create a digest object from a hex string
 */
export function createDigest(hexValue: string): DigestObject {
  return {
    alg: 'sha-256',
    value: hexValue.toLowerCase(),
  };
}

/**
 * Create an empty verification report structure
 */
export function createEmptyReport(
  policy: VerifierPolicy
): Omit<VerificationReport, 'input' | 'result' | 'checks'> {
  return {
    report_version: VERIFICATION_REPORT_VERSION,
    policy,
  };
}

/**
 * Map SSRF fetch error reason to verification reason code
 */
export function ssrfErrorToReasonCode(
  ssrfReason: string,
  fetchType: 'key' | 'pointer'
): ReasonCode {
  const prefix = fetchType === 'key' ? 'key_fetch' : 'pointer_fetch';

  switch (ssrfReason) {
    case 'not_https':
    case 'private_ip':
    case 'loopback':
    case 'link_local':
    case 'cross_origin_redirect':
    case 'dns_failure':
      return `${prefix}_blocked` as ReasonCode;
    case 'timeout':
      return `${prefix}_timeout` as ReasonCode;
    case 'response_too_large':
      return fetchType === 'pointer' ? 'pointer_fetch_too_large' : 'jwks_too_large';
    case 'jwks_too_many_keys':
      return 'jwks_too_many_keys';
    case 'too_many_redirects':
    case 'scheme_downgrade':
    case 'network_error':
    case 'invalid_url':
    default:
      return `${prefix}_failed` as ReasonCode;
  }
}

/**
 * Map reason code to severity
 */
export function reasonCodeToSeverity(reason: ReasonCode): ResultSeverity {
  if (reason === 'ok') return 'info';
  return 'error';
}

/**
 * Map reason code to error code
 */
export function reasonCodeToErrorCode(reason: ReasonCode): string {
  const mapping: Record<ReasonCode, string> = {
    ok: '',
    receipt_too_large: 'E_VERIFY_RECEIPT_TOO_LARGE',
    malformed_receipt: 'E_VERIFY_MALFORMED_RECEIPT',
    signature_invalid: 'E_VERIFY_SIGNATURE_INVALID',
    issuer_not_allowed: 'E_VERIFY_ISSUER_NOT_ALLOWED',
    key_not_found: 'E_VERIFY_KEY_NOT_FOUND',
    key_fetch_blocked: 'E_VERIFY_KEY_FETCH_BLOCKED',
    key_fetch_failed: 'E_VERIFY_KEY_FETCH_FAILED',
    key_fetch_timeout: 'E_VERIFY_KEY_FETCH_TIMEOUT',
    pointer_fetch_blocked: 'E_VERIFY_POINTER_FETCH_BLOCKED',
    pointer_fetch_failed: 'E_VERIFY_POINTER_FETCH_FAILED',
    pointer_fetch_timeout: 'E_VERIFY_POINTER_FETCH_TIMEOUT',
    pointer_fetch_too_large: 'E_VERIFY_POINTER_FETCH_TOO_LARGE',
    pointer_digest_mismatch: 'E_VERIFY_POINTER_DIGEST_MISMATCH',
    jwks_too_large: 'E_VERIFY_JWKS_TOO_LARGE',
    jwks_too_many_keys: 'E_VERIFY_JWKS_TOO_MANY_KEYS',
    expired: 'E_VERIFY_EXPIRED',
    not_yet_valid: 'E_VERIFY_NOT_YET_VALID',
    audience_mismatch: 'E_VERIFY_AUDIENCE_MISMATCH',
    schema_invalid: 'E_VERIFY_SCHEMA_INVALID',
    policy_violation: 'E_VERIFY_POLICY_VIOLATION',
    extension_too_large: 'E_VERIFY_EXTENSION_TOO_LARGE',
    invalid_transport: 'E_VERIFY_INVALID_TRANSPORT',
  };
  return mapping[reason] || 'E_VERIFY_POLICY_VIOLATION';
}
