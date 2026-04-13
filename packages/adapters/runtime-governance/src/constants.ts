/**
 * @peac/adapter-runtime-governance constants
 *
 * Vendor-neutral type URIs and extension namespace for runtime
 * governance record families. Observation-specific suffixes prevent
 * semantic bleed into authoritative claims.
 */

/** Extension namespace for runtime governance record metadata. */
export const EXTENSION_NAMESPACE = 'org.peacprotocol/runtime-governance' as const;

/** Reverse-DNS type prefix for all runtime governance record families. */
export const TYPE_PREFIX = 'org.peacprotocol/runtime-governance-' as const;

/**
 * Canonical type URIs for the 6 runtime governance record families.
 * Each suffix is observation-specific (e.g., "policy-decision" not "policy").
 */
export const EVENT_TYPES = {
  POLICY_DECISION: `${TYPE_PREFIX}policy-decision`,
  AUDIT_ENTRY: `${TYPE_PREFIX}audit-entry`,
  AUTHORITY_SCOPE: `${TYPE_PREFIX}authority-scope`,
  LIFECYCLE_EVENT: `${TYPE_PREFIX}lifecycle-event`,
  TRUST_OBSERVATION: `${TYPE_PREFIX}trust-observation`,
  COMPLIANCE_OBSERVATION: `${TYPE_PREFIX}compliance-observation`,
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Maximum field lengths for validation. */
export const FIELD_LIMITS = {
  /** Identifiers: provider, agent_id, session_id, entry_id, etc. */
  maxIdentifier: 256,
  /** General string fields: action, matched_rule, policy_name, etc. */
  maxString: 1024,
  /** Digest strings: previous_hash, entry_hash, etc. */
  maxDigest: 512,
  /** URI fields: source_artifact_ref, etc. */
  maxUri: 2048,
  /** Timestamp fields: source_timestamp, etc. */
  maxTimestamp: 64,
  /** CloudEvents type URIs. */
  maxCloudEventType: 256,
  /** Array fields: effective_scope, matched_invariants. */
  maxArrayLength: 64,
  /** Array entry string length. */
  maxArrayEntry: 256,
  /** Framework token length. */
  maxFramework: 128,
} as const;
