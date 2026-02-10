/**
 * Dispute Bundle Types (v0.9.30+)
 *
 * DisputeBundle is a ZIP archive containing receipts, keys, and policy
 * for offline verification and audit. Distinct from CaseBundle (JSONL).
 *
 * Key design principles:
 * 1. ZIP is transport container, not what we hash
 * 2. Deterministic integrity at content layer (JCS-canonicalized manifest)
 * 3. receipts.ndjson format for determinism + streaming
 * 4. bundle.sig for authenticity
 */

/**
 * Bundle format version.
 * Normalized in v0.10.0 to peac-<artifact>/<major>.<minor> pattern.
 * The `kind` field distinguishes bundle types (dispute, audit, etc.).
 */
export const BUNDLE_VERSION = 'peac-bundle/0.1' as const;

/**
 * @deprecated Use BUNDLE_VERSION instead. Will be removed in v1.0.
 */
export const DISPUTE_BUNDLE_VERSION = BUNDLE_VERSION;

/**
 * Verification report format version.
 * Normalized in v0.10.0 to peac-<artifact>/<major>.<minor> pattern.
 */
export const VERIFICATION_REPORT_VERSION = 'peac-verification-report/0.1' as const;

/**
 * Bundle kind - identifies the purpose of the bundle.
 */
export type BundleKind = 'dispute' | 'audit' | 'archive';

/**
 * File entry in the bundle manifest.
 * Each file has a SHA-256 hash for integrity verification.
 */
export interface ManifestFileEntry {
  /** Relative path within the bundle (e.g., "receipts.ndjson", "keys/keys.json") */
  path: string;

  /** SHA-256 hash of file contents (hex-encoded, lowercase) */
  sha256: string;

  /** File size in bytes */
  size: number;
}

/**
 * Receipt entry in the manifest.
 * Provides receipt metadata for ordering and lookup.
 */
export interface ManifestReceiptEntry {
  /** Receipt ID (from claims.jti) */
  receipt_id: string;

  /** When the receipt was issued (ISO 8601) */
  issued_at: string;

  /** SHA-256 hash of the JWS bytes (for deduplication and ordering) */
  receipt_hash: string;
}

/**
 * Key entry in the manifest.
 * Maps key IDs to their algorithms.
 */
export interface ManifestKeyEntry {
  /** Key ID (kid from JWK) */
  kid: string;

  /** Key algorithm (e.g., "EdDSA") */
  alg: string;
}

/**
 * Bundle time range.
 * All receipts must have issued_at within this range.
 */
export interface BundleTimeRange {
  /** Earliest receipt issued_at (ISO 8601) */
  start: string;

  /** Latest receipt issued_at (ISO 8601) */
  end: string;
}

/**
 * Bundle reference - identifies what this bundle is for.
 * Format: sha256:<hex> for hash-based refs, or ULID/UUID for ID refs.
 */
export interface BundleRef {
  /** Reference type */
  type: 'dispute' | 'receipt' | 'audit_case' | 'external';

  /** Reference ID (ULID, UUID, or sha256:<hex> hash) */
  id: string;
}

/**
 * Bundle manifest (manifest.json).
 *
 * The manifest is the source of truth for bundle integrity.
 * `content_hash` is sha256:<hex> of JCS(manifest without content_hash).
 */
export interface DisputeBundleManifest {
  /** Bundle format version (peac-bundle/0.1) */
  version: typeof BUNDLE_VERSION;

  /** Bundle kind - what type of bundle this is */
  kind: BundleKind;

  /** Unique bundle identifier (ULID) */
  bundle_id: string;

  /** What this bundle references (replaces dispute_ref) */
  refs: BundleRef[];

  /**
   * @deprecated Use refs instead. Will be removed in v1.0.
   * Dispute reference this bundle is for (ULID)
   */
  dispute_ref?: string;

  /** Who created the bundle (URI) */
  created_by: string;

  /** When the bundle was created (ISO 8601) */
  created_at: string;

  /** Time range covered by receipts */
  time_range: BundleTimeRange;

  /** Receipt entries (sorted by issued_at, then receipt_id, then receipt_hash) */
  receipts: ManifestReceiptEntry[];

  /** Key entries (sorted by kid) */
  keys: ManifestKeyEntry[];

  /** All files in the bundle (sorted by path) */
  files: ManifestFileEntry[];

  /** sha256:<hex> hash of policy.yaml if included */
  policy_hash?: string;

  /**
   * sha256:<hex> hash of peac.txt file if included (DD-49).
   *
   * Enables offline policy binding verification: verifiers can compare this
   * hash against the policy digest in Wire 0.2 receipts to confirm the policy
   * in effect at issuance time matches what is bundled.
   *
   * Bundle path: policy/peac.txt (locked convention).
   */
  peac_txt_hash?: string;

  /** sha256:<hex> of JCS(manifest without content_hash) - deterministic bundle hash */
  content_hash: string;
}

/**
 * Options for creating a dispute bundle.
 */
export interface CreateDisputeBundleOptions {
  /** Bundle kind (defaults to 'dispute') */
  kind?: BundleKind;

  /** Bundle references (what this bundle is for) */
  refs?: BundleRef[];

  /**
   * @deprecated Use refs instead. Will be removed in v1.0.
   * Dispute reference (ULID)
   */
  dispute_ref?: string;

  /** Who is creating the bundle (URI) */
  created_by: string;

  /** Receipt JWS strings to include */
  receipts: string[];

  /** JWKS containing public keys for verification */
  keys: JsonWebKeySet;

  /** Optional policy YAML content */
  policy?: string;

  /**
   * Optional peac.txt file content (DD-49).
   *
   * If provided, stored as policy/peac.txt in the bundle and its SHA-256
   * hash is recorded in the manifest as peac_txt_hash.
   *
   * Bundle path: policy/peac.txt (locked convention).
   */
  peac_txt?: string;

  /** Optional bundle ID (generated if not provided) */
  bundle_id?: string;

  /** Optional created_at timestamp (for deterministic fixtures) */
  created_at?: string;

  /** Optional signing key for bundle.sig (Ed25519 private key, 32 bytes) */
  signing_key?: Uint8Array;

  /** Key ID for bundle.sig (required if signing_key is provided) */
  signing_kid?: string;
}

/**
 * JSON Web Key Set (JWKS) structure.
 */
export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

/**
 * JSON Web Key (JWK) with required fields for PEAC.
 */
export interface JsonWebKey {
  /** Key type (e.g., "OKP" for Ed25519) */
  kty: string;

  /** Key ID */
  kid: string;

  /** Algorithm (e.g., "EdDSA") */
  alg?: string;

  /** Curve (e.g., "Ed25519") */
  crv?: string;

  /** Public key (base64url) */
  x?: string;

  /** Key use (e.g., "sig") */
  use?: string;

  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Result of reading a dispute bundle.
 */
export interface DisputeBundleContents {
  /** Parsed manifest */
  manifest: DisputeBundleManifest;

  /** Receipt JWS strings by receipt_id */
  receipts: Map<string, string>;

  /** JWKS containing all keys */
  keys: JsonWebKeySet;

  /** Policy content if present */
  policy?: string;

  /** peac.txt file content if present (DD-49) */
  peac_txt?: string;

  /** bundle.sig JWS if present */
  bundle_sig?: string;
}

/**
 * Receipt verification result.
 */
export interface ReceiptVerificationResult {
  /** Receipt ID */
  receipt_id: string;

  /** Whether signature is valid */
  signature_valid: boolean;

  /** Whether claims are valid */
  claims_valid: boolean;

  /** Key ID used to sign */
  key_id?: string;

  /** Error codes if invalid */
  errors: string[];

  /** Parsed claims if valid */
  claims?: Record<string, unknown>;
}

/**
 * Key usage tracking.
 */
export interface KeyUsageEntry {
  /** Key ID */
  kid: string;

  /** Number of receipts signed with this key */
  receipts_signed: number;

  /** Receipt IDs signed with this key */
  receipt_ids: string[];
}

/**
 * Auditor-friendly summary.
 */
export interface AuditorSummary {
  /** One-line headline (e.g., "17/20 receipts valid") */
  headline: string;

  /** List of issues found */
  issues: string[];

  /** Recommendation based on findings */
  recommendation: 'valid' | 'invalid' | 'needs_review';
}

/**
 * Bundle signature verification result.
 */
export interface BundleSignatureResult {
  /** Whether bundle.sig was present */
  present: boolean;

  /** Whether the signature is valid (only set if present) */
  valid?: boolean;

  /** Key ID used to sign the bundle (only set if present) */
  key_id?: string;

  /** Error if signature verification failed */
  error?: string;
}

/**
 * Deterministic verification report.
 *
 * This is the canonical output format for bundle verification.
 * `report_hash` is SHA-256 of JCS(report without report_hash).
 */
export interface VerificationReport {
  /** Report format version */
  version: typeof VERIFICATION_REPORT_VERSION;

  /** Bundle content hash (from manifest) */
  bundle_content_hash: string;

  /** Bundle signature verification result */
  bundle_signature: BundleSignatureResult;

  /** Summary counts */
  summary: {
    total_receipts: number;
    valid: number;
    invalid: number;
  };

  /** Individual receipt results (sorted by receipt_id) */
  receipts: ReceiptVerificationResult[];

  /** Keys used in verification (sorted by kid) */
  keys_used: KeyUsageEntry[];

  /** Human-friendly summary */
  auditor_summary: AuditorSummary;

  /** SHA-256 of JCS(report without report_hash) - deterministic report hash */
  report_hash: string;
}

/**
 * Options for bundle verification.
 */
export interface VerifyBundleOptions {
  /** Use only keys from the bundle (no external key fetching) */
  offline: boolean;

  /** Custom time for validation (defaults to now) */
  now?: Date;
}

/**
 * Bundle read/write error.
 */
export interface BundleError {
  /** Error code (E_BUNDLE_*) */
  code: string;

  /** Human-readable message */
  message: string;

  /** Additional context */
  details?: Record<string, unknown>;
}

/**
 * Result type for bundle operations.
 */
export type BundleResult<T> = { ok: true; value: T } | { ok: false; error: BundleError };
