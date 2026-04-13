/**
 * @peac/adapter-runtime-governance extension builders
 *
 * Explicit per-family extension data builders. Each builder selects
 * exactly which fields appear in the extension output. Unknown upstream
 * fields never become top-level extension keys.
 */

import type {
  RuntimeGovernancePayload,
  PolicyDecisionPayload,
  AuditEntryPayload,
  AuthorityScopePayload,
  LifecycleEventPayload,
  TrustObservationPayload,
  ComplianceObservationPayload,
  PreservedUpstreamArtifact,
  RuntimeGovernanceFamily,
} from './types.js';

interface CommonFields {
  session_id: string;
  event: string;
  agent_id: string;
  provider: string;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = stripUndefined(value as Record<string, unknown>);
        if (Object.keys(nested).length > 0) {
          result[key] = nested;
        }
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function buildPolicyDecisionExtension(
  payload: PolicyDecisionPayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    action: payload.action,
    matched_rule: payload.matched_rule,
    policy_name: payload.policy_name,
    reason: payload.reason,
    evaluation_ms: payload.evaluation_ms,
    upstream,
  });
}

function buildAuditEntryExtension(
  payload: AuditEntryPayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    entry_id: payload.entry_id,
    event_type: payload.event_type,
    outcome: payload.outcome,
    previous_hash: payload.previous_hash,
    entry_hash: payload.entry_hash,
    trace_id: payload.trace_id,
    upstream,
  });
}

function buildAuthorityScopeExtension(
  payload: AuthorityScopePayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    decision: payload.decision,
    effective_scope: payload.effective_scope,
    trust_tier: payload.trust_tier,
    matched_invariants: payload.matched_invariants,
    upstream,
  });
}

function buildLifecycleEventExtension(
  payload: LifecycleEventPayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    lifecycle_event_type: payload.lifecycle_event_type,
    previous_state: payload.previous_state,
    new_state: payload.new_state,
    actor: payload.actor,
    upstream,
  });
}

function buildTrustObservationExtension(
  payload: TrustObservationPayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    peer_id: payload.peer_id,
    action: payload.action,
    success: payload.success,
    trust_delta: payload.trust_delta,
    trust_score: payload.trust_score,
    upstream,
  });
}

function buildComplianceObservationExtension(
  payload: ComplianceObservationPayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
): Record<string, unknown> {
  return stripUndefined({
    ...common,
    framework: payload.framework,
    compliance_score: payload.compliance_score,
    violation_count: payload.violation_count,
    evidence_item_count: payload.evidence_item_count,
    upstream,
  });
}

type ExtensionBuilder = (
  payload: RuntimeGovernancePayload,
  common: CommonFields,
  upstream?: PreservedUpstreamArtifact
) => Record<string, unknown>;

/**
 * Per-family extension builder registry.
 * issueRuntimeGovernanceRecord() dispatches to the correct builder.
 */
export const FAMILY_BUILDERS: Record<RuntimeGovernanceFamily, ExtensionBuilder> = {
  policy_decision: (p, c, u) => buildPolicyDecisionExtension(p as PolicyDecisionPayload, c, u),
  audit_entry: (p, c, u) => buildAuditEntryExtension(p as AuditEntryPayload, c, u),
  authority_scope: (p, c, u) => buildAuthorityScopeExtension(p as AuthorityScopePayload, c, u),
  lifecycle_event: (p, c, u) => buildLifecycleEventExtension(p as LifecycleEventPayload, c, u),
  trust_observation: (p, c, u) =>
    buildTrustObservationExtension(p as TrustObservationPayload, c, u),
  compliance_observation: (p, c, u) =>
    buildComplianceObservationExtension(p as ComplianceObservationPayload, c, u),
};
