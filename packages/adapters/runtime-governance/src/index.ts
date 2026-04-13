/**
 * @peac/adapter-runtime-governance
 *
 * Generic runtime governance adapter for PEAC interaction records.
 * Maps runtime governance artifacts to signed Interaction Records
 * using 6 observation-specific type URIs.
 *
 * PEAC validates the structure and signature of the PEAC record,
 * not the truth of the upstream governance decision or the operating
 * effectiveness of the upstream control plane.
 *
 * AGT is the first mapper. The provider field is always caller-supplied.
 * No vendor SDK dependencies.
 */

// Constants
export {
  EXTENSION_NAMESPACE,
  TYPE_PREFIX,
  EVENT_TYPES,
  FIELD_LIMITS,
  type EventType,
} from './constants.js';

// Types
export {
  RUNTIME_GOVERNANCE_FAMILIES,
  type RuntimeGovernanceFamily,
  type PreservedUpstreamArtifact,
  type PolicyDecisionPayload,
  type AuditEntryPayload,
  type AuthorityScopePayload,
  type LifecycleEventPayload,
  type TrustObservationPayload,
  type ComplianceObservationPayload,
  type RuntimeGovernancePayload,
  type RuntimeGovernanceEvent,
  type IssueOptions,
  type IssueResult,
  type SessionSummary,
} from './types.js';

// Family registry
export { FAMILY_REGISTRY, type FamilyEntry } from './families.js';

// Normalization
export { normalizeRuntimeGovernanceEvent, NormalizationError } from './normalize.js';

// Issuance
export { issueRuntimeGovernanceRecord } from './issue.js';

// Session summary
export { buildSessionSummary } from './session-summary.js';

// Mappers
export { mapAgtEvent, type AgtEventInput } from './mappers/index.js';
