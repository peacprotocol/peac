/**
 * @peac/adapter-runtime-governance types
 *
 * Discriminated union payload model with per-family typing.
 * No weak Record<string, unknown> blobs.
 */

/**
 * Runtime governance record families.
 * String-literal union (not enum) for lighter output and tree-shaking.
 */
export const RUNTIME_GOVERNANCE_FAMILIES = [
  'policy_decision',
  'audit_entry',
  'authority_scope',
  'lifecycle_event',
  'trust_observation',
  'compliance_observation',
] as const;

export type RuntimeGovernanceFamily = (typeof RUNTIME_GOVERNANCE_FAMILIES)[number];

/**
 * Preserved upstream artifact context.
 * All optional, all observational. Bounded fields, no arbitrary passthrough.
 */
export interface PreservedUpstreamArtifact {
  /** Upstream system identifier (max 256 chars). */
  source_system?: string;
  /** Upstream event type identifier (max 256 chars). */
  source_event_type?: string;
  /** Upstream event identifier for deduplication (max 256 chars). */
  source_event_id?: string;
  /** Upstream event timestamp (RFC 3339, max 64 chars). */
  source_timestamp?: string;
  /** Hash of upstream artifact (max 512 chars). */
  source_artifact_hash?: string;
  /** URI or reference to upstream artifact (max 2048 chars). */
  source_artifact_ref?: string;
  /** CloudEvents type URI for cross-system correlation (max 256 chars). */
  source_cloud_event_type?: string;
}

/** Policy decision payload. */
export interface PolicyDecisionPayload {
  family: 'policy_decision';
  action: string;
  matched_rule?: string;
  policy_name?: string;
  reason?: string;
  evaluation_ms?: number;
}

/** Audit entry payload. */
export interface AuditEntryPayload {
  family: 'audit_entry';
  entry_id?: string;
  event_type?: string;
  outcome?: string;
  previous_hash?: string;
  entry_hash?: string;
  trace_id?: string;
}

/** Authority scope payload. */
export interface AuthorityScopePayload {
  family: 'authority_scope';
  decision?: string;
  effective_scope?: string[];
  trust_tier?: string;
  matched_invariants?: string[];
}

/** Lifecycle event payload. */
export interface LifecycleEventPayload {
  family: 'lifecycle_event';
  lifecycle_event_type?: string;
  previous_state?: string;
  new_state?: string;
  actor?: string;
}

/** Trust observation payload. */
export interface TrustObservationPayload {
  family: 'trust_observation';
  peer_id?: string;
  action?: string;
  success?: boolean;
  trust_delta?: number;
  trust_score?: number;
}

/** Compliance observation payload. */
export interface ComplianceObservationPayload {
  family: 'compliance_observation';
  framework?: string;
  compliance_score?: number;
  violation_count?: number;
  evidence_item_count?: number;
}

/** Discriminated union of all family payloads. */
export type RuntimeGovernancePayload =
  | PolicyDecisionPayload
  | AuditEntryPayload
  | AuthorityScopePayload
  | LifecycleEventPayload
  | TrustObservationPayload
  | ComplianceObservationPayload;

/**
 * Normalized runtime governance event.
 * Generic input to issueRuntimeGovernanceRecord().
 */
export interface RuntimeGovernanceEvent {
  /** Specific event name (e.g., 'policy.evaluated'). */
  event_name: string;
  /** Typed, validated payload (discriminated by family). */
  payload: RuntimeGovernancePayload;
  /** Optional preserved upstream artifact context. */
  upstream?: PreservedUpstreamArtifact;
}

/** Options for issuing a runtime governance record. */
export interface IssueOptions {
  /** Ed25519 private key (32 bytes). Caller-provided; never stored. */
  privateKey: Uint8Array;
  /** Key ID (max 256 chars). */
  kid: string;
  /** Canonical issuer URL (HTTPS or DID). */
  issuer: string;
  /** Session identifier for event correlation. */
  sessionId: string;
  /** Agent identifier. */
  agentId: string;
  /** Provider name. Caller-supplied; never hardcoded. */
  provider: string;
}

/** Result of issuing a runtime governance record. */
export interface IssueResult {
  /** Compact JWS (signed Interaction Record). */
  jws: string;
  /** PEAC event type URI used. */
  type: string;
  /** Record family. */
  family: RuntimeGovernanceFamily;
}

/** Session summary aggregated from decoded receipts. */
export interface SessionSummary {
  /** Session identifier. */
  sessionId: string;
  /** Total receipts in the session. */
  receipts: number;
  /** Distinct families represented (sorted alphabetically). */
  families: RuntimeGovernanceFamily[];
  /** Count of receipts with unrecognized type URIs. */
  unknownTypeCount: number;
  /** Issuer (from the first receipt, or empty if no receipts). */
  issuer: string;
}
