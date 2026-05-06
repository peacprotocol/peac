/**
 * A2A handoff observation helpers (v0.14.1).
 *
 * Re-exports the observational helpers that produce extension payloads under
 * `org.peacprotocol/a2a-handoff`. See:
 *  - `docs/specs/A2A-HANDOFF-RECORDS.md` for the normative profile
 *  - `docs/specs/A2A-RECEIPT-PROFILE.md` for the carrier contract
 */

export { fromA2AAgentCardObservation } from './agent-card';
export type {
  AgentCardObservationInput,
  CallerReportedVerification,
  DiscoveryPath,
  SignatureObservationInput,
} from './agent-card';

export { fromA2ATaskObservation } from './handoff';
export type { A2ATaskEvent, A2ATaskObservationInput, AgentRefInput } from './handoff';
