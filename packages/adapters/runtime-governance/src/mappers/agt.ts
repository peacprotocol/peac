/**
 * AGT-specific mapper
 *
 * Normalizes AGT-shaped JSON input into the generic
 * RuntimeGovernanceEvent model. Accepts raw JSON (not AGT SDK objects).
 *
 * Pinned to AGT v3.1.0 pre-release documentation (as of 2026-04-13).
 */

import { normalizeRuntimeGovernanceEvent, NormalizationError } from '../normalize.js';
import type { RuntimeGovernanceEvent, RuntimeGovernanceFamily } from '../types.js';

/** AGT-shaped input. Raw JSON, not SDK objects. */
export interface AgtEventInput {
  /** Family name matching a RuntimeGovernanceFamily. */
  family: string;
  /** Specific event name (e.g., 'policy.evaluated'). */
  event: string;
  /** Event-specific data fields. */
  data: Record<string, unknown>;
  /** Optional upstream source context. */
  source?: {
    system?: string;
    event_type?: string;
    event_id?: string;
    timestamp?: string;
    artifact_hash?: string;
    artifact_ref?: string;
    cloud_event_type?: string;
  };
}

const AGT_FAMILY_MAP: Record<string, RuntimeGovernanceFamily> = {
  policy_decision: 'policy_decision',
  audit_entry: 'audit_entry',
  authority_scope: 'authority_scope',
  lifecycle_event: 'lifecycle_event',
  trust_observation: 'trust_observation',
  compliance_observation: 'compliance_observation',
};

/**
 * Map an AGT-shaped event input to a normalized RuntimeGovernanceEvent.
 * Throws NormalizationError on unrecognized or malformed input.
 */
export function mapAgtEvent(input: AgtEventInput): RuntimeGovernanceEvent {
  const family = AGT_FAMILY_MAP[input.family];
  if (!family) {
    throw new NormalizationError(`unrecognized AGT family: ${input.family}`, 'family');
  }

  const raw = {
    event_name: input.event,
    payload: {
      family,
      ...input.data,
    },
    upstream: input.source
      ? {
          source_system: input.source.system,
          source_event_type: input.source.event_type,
          source_event_id: input.source.event_id,
          source_timestamp: input.source.timestamp,
          source_artifact_hash: input.source.artifact_hash,
          source_artifact_ref: input.source.artifact_ref,
          source_cloud_event_type: input.source.cloud_event_type,
        }
      : undefined,
  };

  return normalizeRuntimeGovernanceEvent(raw);
}
