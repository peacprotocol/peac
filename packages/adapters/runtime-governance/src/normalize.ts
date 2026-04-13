/**
 * @peac/adapter-runtime-governance normalization and validation
 *
 * Fail-closed input validation for runtime governance payloads.
 * Rejects malformed input with descriptive errors.
 *
 * These are adapter-level shape prechecks: string presence, max lengths,
 * numeric bounds, RFC 3339 format, digest grammar (algorithm:hex), and
 * URI scheme presence. Protocol-layer validation (@peac/protocol issue()
 * and @peac/schema Wire02ClaimsSchema) remains authoritative for issuer
 * canonicality, JOSE hardening, and wire-format compliance. Adapter
 * validators catch obviously malformed input before it reaches the
 * protocol layer.
 *
 * PEAC validates the structure of carried values, not upstream truth.
 * Trust scores are structurally validated (finite, 0-1000 integer)
 * but never derived, recomputed, ranked, or authoritatively assessed.
 */

import { FIELD_LIMITS } from './constants.js';
import { RUNTIME_GOVERNANCE_FAMILIES } from './types.js';
import type {
  RuntimeGovernanceFamily,
  RuntimeGovernancePayload,
  PreservedUpstreamArtifact,
  RuntimeGovernanceEvent,
} from './types.js';

export class NormalizationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = 'NormalizationError';
  }
}

function requireString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== 'string') {
    throw new NormalizationError(`${field} must be a string`, field);
  }
  if (value.length === 0) {
    throw new NormalizationError(`${field} must not be empty`, field);
  }
  if (value.length > maxLen) {
    throw new NormalizationError(`${field} exceeds max length ${maxLen}`, field);
  }
  return value;
}

function optionalString(value: unknown, field: string, maxLen: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, field, maxLen);
}

function optionalFiniteNumber(
  value: unknown,
  field: string,
  min?: number,
  max?: number
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new NormalizationError(`${field} must be a finite number`, field);
  }
  if (min !== undefined && value < min) {
    throw new NormalizationError(`${field} must be >= ${min}`, field);
  }
  if (max !== undefined && value > max) {
    throw new NormalizationError(`${field} must be <= ${max}`, field);
  }
  return value;
}

function optionalInteger(
  value: unknown,
  field: string,
  min?: number,
  max?: number
): number | undefined {
  const n = optionalFiniteNumber(value, field, min, max);
  if (n !== undefined && !Number.isInteger(n)) {
    throw new NormalizationError(`${field} must be an integer`, field);
  }
  return n;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new NormalizationError(`${field} must be a boolean`, field);
  }
  return value;
}

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function optionalRfc3339(value: unknown, field: string, maxLen: number): string | undefined {
  const s = optionalString(value, field, maxLen);
  if (s !== undefined && !RFC3339_PATTERN.test(s)) {
    throw new NormalizationError(`${field} must be RFC 3339 format`, field);
  }
  return s;
}

const DIGEST_PATTERN = /^[a-zA-Z0-9_-]+:[a-fA-F0-9]+$/;

function optionalDigest(value: unknown, field: string, maxLen: number): string | undefined {
  const s = optionalString(value, field, maxLen);
  if (s !== undefined && !DIGEST_PATTERN.test(s)) {
    throw new NormalizationError(`${field} must match digest pattern (algorithm:hex)`, field);
  }
  return s;
}

const URI_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function optionalUri(value: unknown, field: string, maxLen: number): string | undefined {
  const s = optionalString(value, field, maxLen);
  if (s !== undefined && !URI_PATTERN.test(s)) {
    throw new NormalizationError(`${field} must be a valid URI`, field);
  }
  return s;
}

function optionalStringArray(
  value: unknown,
  field: string,
  maxLen: number,
  maxEntryLen: number
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new NormalizationError(`${field} must be an array`, field);
  }
  if (value.length > maxLen) {
    throw new NormalizationError(`${field} exceeds max length ${maxLen}`, field);
  }
  return value.map((entry, i) => requireString(entry, `${field}[${i}]`, maxEntryLen));
}

function normalizePolicyDecision(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'policy_decision',
    action: requireString(input.action, 'action', FIELD_LIMITS.maxString),
    matched_rule: optionalString(input.matched_rule, 'matched_rule', FIELD_LIMITS.maxString),
    policy_name: optionalString(input.policy_name, 'policy_name', FIELD_LIMITS.maxString),
    reason: optionalString(input.reason, 'reason', FIELD_LIMITS.maxString),
    evaluation_ms: optionalFiniteNumber(input.evaluation_ms, 'evaluation_ms', 0),
  };
}

function normalizeAuditEntry(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'audit_entry',
    entry_id: optionalString(input.entry_id, 'entry_id', FIELD_LIMITS.maxIdentifier),
    event_type: optionalString(input.event_type, 'event_type', FIELD_LIMITS.maxString),
    outcome: optionalString(input.outcome, 'outcome', FIELD_LIMITS.maxString),
    previous_hash: optionalDigest(input.previous_hash, 'previous_hash', FIELD_LIMITS.maxDigest),
    entry_hash: optionalDigest(input.entry_hash, 'entry_hash', FIELD_LIMITS.maxDigest),
    trace_id: optionalString(input.trace_id, 'trace_id', FIELD_LIMITS.maxIdentifier),
  };
}

function normalizeAuthorityScope(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'authority_scope',
    decision: optionalString(input.decision, 'decision', FIELD_LIMITS.maxString),
    effective_scope: optionalStringArray(
      input.effective_scope,
      'effective_scope',
      FIELD_LIMITS.maxArrayLength,
      FIELD_LIMITS.maxArrayEntry
    ),
    trust_tier: optionalString(input.trust_tier, 'trust_tier', FIELD_LIMITS.maxString),
    matched_invariants: optionalStringArray(
      input.matched_invariants,
      'matched_invariants',
      FIELD_LIMITS.maxArrayLength,
      FIELD_LIMITS.maxArrayEntry
    ),
  };
}

function normalizeLifecycleEvent(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'lifecycle_event',
    lifecycle_event_type: optionalString(
      input.lifecycle_event_type,
      'lifecycle_event_type',
      FIELD_LIMITS.maxString
    ),
    previous_state: optionalString(input.previous_state, 'previous_state', FIELD_LIMITS.maxString),
    new_state: optionalString(input.new_state, 'new_state', FIELD_LIMITS.maxString),
    actor: optionalString(input.actor, 'actor', FIELD_LIMITS.maxIdentifier),
  };
}

function normalizeTrustObservation(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'trust_observation',
    peer_id: optionalString(input.peer_id, 'peer_id', FIELD_LIMITS.maxIdentifier),
    action: optionalString(input.action, 'action', FIELD_LIMITS.maxString),
    success: optionalBoolean(input.success, 'success'),
    trust_delta: optionalInteger(input.trust_delta, 'trust_delta', -1000, 1000),
    trust_score: optionalInteger(input.trust_score, 'trust_score', 0, 1000),
  };
}

function normalizeComplianceObservation(input: Record<string, unknown>): RuntimeGovernancePayload {
  return {
    family: 'compliance_observation',
    framework: optionalString(input.framework, 'framework', FIELD_LIMITS.maxFramework),
    compliance_score: optionalFiniteNumber(input.compliance_score, 'compliance_score', 0, 100),
    violation_count: optionalInteger(input.violation_count, 'violation_count', 0),
    evidence_item_count: optionalInteger(input.evidence_item_count, 'evidence_item_count', 0),
  };
}

const FAMILY_NORMALIZERS: Record<
  RuntimeGovernanceFamily,
  (input: Record<string, unknown>) => RuntimeGovernancePayload
> = {
  policy_decision: normalizePolicyDecision,
  audit_entry: normalizeAuditEntry,
  authority_scope: normalizeAuthorityScope,
  lifecycle_event: normalizeLifecycleEvent,
  trust_observation: normalizeTrustObservation,
  compliance_observation: normalizeComplianceObservation,
};

function normalizeUpstream(input: unknown): PreservedUpstreamArtifact | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new NormalizationError('upstream must be a plain object', 'upstream');
  }
  const obj = input as Record<string, unknown>;
  return {
    source_system: optionalString(
      obj.source_system,
      'upstream.source_system',
      FIELD_LIMITS.maxIdentifier
    ),
    source_event_type: optionalString(
      obj.source_event_type,
      'upstream.source_event_type',
      FIELD_LIMITS.maxIdentifier
    ),
    source_event_id: optionalString(
      obj.source_event_id,
      'upstream.source_event_id',
      FIELD_LIMITS.maxIdentifier
    ),
    source_timestamp: optionalRfc3339(
      obj.source_timestamp,
      'upstream.source_timestamp',
      FIELD_LIMITS.maxTimestamp
    ),
    source_artifact_hash: optionalDigest(
      obj.source_artifact_hash,
      'upstream.source_artifact_hash',
      FIELD_LIMITS.maxDigest
    ),
    source_artifact_ref: optionalUri(
      obj.source_artifact_ref,
      'upstream.source_artifact_ref',
      FIELD_LIMITS.maxUri
    ),
    source_cloud_event_type: optionalString(
      obj.source_cloud_event_type,
      'upstream.source_cloud_event_type',
      FIELD_LIMITS.maxCloudEventType
    ),
  };
}

/**
 * Normalize and validate a raw runtime governance event input.
 * Fail-closed: rejects malformed input with descriptive errors.
 */
export function normalizeRuntimeGovernanceEvent(input: unknown): RuntimeGovernanceEvent {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new NormalizationError('input must be a plain object', 'input');
  }
  const obj = input as Record<string, unknown>;

  const eventName = requireString(obj.event_name, 'event_name', FIELD_LIMITS.maxString);

  if (typeof obj.payload !== 'object' || obj.payload === null || Array.isArray(obj.payload)) {
    throw new NormalizationError('payload must be a plain object', 'payload');
  }
  const payloadObj = obj.payload as Record<string, unknown>;

  const family = payloadObj.family;
  if (
    typeof family !== 'string' ||
    !(RUNTIME_GOVERNANCE_FAMILIES as readonly string[]).includes(family)
  ) {
    throw new NormalizationError(
      `payload.family must be one of: ${RUNTIME_GOVERNANCE_FAMILIES.join(', ')}`,
      'payload.family'
    );
  }

  const normalizer = FAMILY_NORMALIZERS[family as RuntimeGovernanceFamily];
  const payload = normalizer(payloadObj);

  return {
    event_name: eventName,
    payload,
    upstream: normalizeUpstream(obj.upstream),
  };
}
