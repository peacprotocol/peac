/**
 * PEAC Subject Record Types
 *
 * Subject records for identity and authorization context.
 * Used in conjunction with receipts and control decisions.
 *
 * Terminology (v0.12.2, DD-173.5): "Subject record" is the canonical name
 * for identity/classification data structures. "Profile" is reserved for
 * usage overlay documents in docs/profiles/ (PROFILE_RULES.md).
 *
 * The legacy names SubjectProfile and SubjectProfileSnapshot are preserved
 * as deprecated aliases for backward compatibility. Remove-not-before: v0.13.0.
 */

/**
 * Subject identifier (opaque string)
 *
 * Examples:
 * - "user:alice@example.com"
 * - "org:acme-corp"
 * - "agent:gpt-4-crawler"
 */
export type SubjectId = string;

/**
 * Subject type classification
 *
 * - "human": Individual person
 * - "org": Organization or legal entity
 * - "agent": Autonomous software agent (AI, bot, crawler)
 */
export type SubjectType = 'human' | 'org' | 'agent';

/**
 * Subject record: identity and classification
 *
 * Minimal record structure for subjects in the PEAC ecosystem.
 * Records are intentionally lightweight; detailed identity
 * attributes belong in external identity systems.
 *
 * Invariants:
 * - `id` is REQUIRED (non-empty string)
 * - `type` is REQUIRED (one of: human, org, agent)
 * - `labels` if present must be non-empty strings
 */
export interface SubjectProfile {
  /**
   * Subject identifier (REQUIRED)
   *
   * Stable, unique identifier for this subject.
   * Format is application-specific.
   */
  id: SubjectId;

  /**
   * Subject type (REQUIRED)
   *
   * Classification of the subject for policy purposes.
   */
  type: SubjectType;

  /**
   * Labels for categorization (OPTIONAL)
   *
   * Freeform tags for grouping or filtering subjects.
   * Examples: ["premium", "verified"], ["crawler", "indexer"]
   */
  labels?: string[];

  /**
   * Additional metadata (OPTIONAL)
   *
   * Application-specific attributes.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Subject record snapshot: point-in-time capture
 *
 * Captures the state of a subject record at a specific moment.
 * Used for audit trails, policy evaluation records, and receipts.
 *
 * Invariants:
 * - `subject` is REQUIRED (valid SubjectProfile)
 * - `captured_at` is REQUIRED (ISO 8601 timestamp)
 */
export interface SubjectProfileSnapshot {
  /**
   * Subject record (REQUIRED)
   *
   * The captured record state.
   */
  subject: SubjectProfile;

  /**
   * Capture timestamp (REQUIRED)
   *
   * MUST be an RFC 3339 / ISO 8601 UTC timestamp string.
   * Examples:
   * - "2025-01-15T10:30:00Z"
   * - "2025-01-15T10:30:00.123Z"
   *
   * Note: Schema validates non-empty string only; format
   * enforcement is left to application layer for v0.9.16.
   */
  captured_at: string;

  /**
   * Source of the snapshot (OPTIONAL)
   *
   * Identifies where this profile data came from.
   * Examples:
   * - "idp:auth0"
   * - "directory:ldap"
   * - "manual"
   */
  source?: string;

  /**
   * Record version (OPTIONAL)
   *
   * Version tag for the record schema or data.
   * Useful for tracking record format changes over time.
   */
  version?: string;
}

// ---------------------------------------------------------------------------
// Canonical type aliases (v0.12.2, DD-173.5)
// ---------------------------------------------------------------------------

/**
 * Canonical name for subject identity/classification data.
 *
 * "SubjectRecord" replaces "SubjectProfile" to avoid confusion with
 * usage profile documents (docs/profiles/). See PROFILE_RULES.md.
 */
export type SubjectRecord = SubjectProfile;

/**
 * Canonical name for subject identity/classification snapshot.
 *
 * "SubjectRecordSnapshot" replaces "SubjectProfileSnapshot" to avoid
 * confusion with usage profile documents. See PROFILE_RULES.md.
 */
export type SubjectRecordSnapshot = SubjectProfileSnapshot;
