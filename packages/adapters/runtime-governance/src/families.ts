/**
 * Family registry.
 *
 * Maps each RuntimeGovernanceFamily to its canonical type URI
 * and Interaction Record kind. All families produce `evidence` kind.
 */

import { EVENT_TYPES, type EventType } from './constants.js';
import type { RuntimeGovernanceFamily } from './types.js';

export interface FamilyEntry {
  /** Canonical type URI for this family. */
  type: EventType;
  /** Interaction Record kind. Always 'evidence' for runtime governance. */
  kind: 'evidence';
}

export const FAMILY_REGISTRY: Record<RuntimeGovernanceFamily, FamilyEntry> = {
  policy_decision: { type: EVENT_TYPES.POLICY_DECISION, kind: 'evidence' },
  audit_entry: { type: EVENT_TYPES.AUDIT_ENTRY, kind: 'evidence' },
  authority_scope: { type: EVENT_TYPES.AUTHORITY_SCOPE, kind: 'evidence' },
  lifecycle_event: { type: EVENT_TYPES.LIFECYCLE_EVENT, kind: 'evidence' },
  trust_observation: { type: EVENT_TYPES.TRUST_OBSERVATION, kind: 'evidence' },
  compliance_observation: { type: EVENT_TYPES.COMPLIANCE_OBSERVATION, kind: 'evidence' },
};
