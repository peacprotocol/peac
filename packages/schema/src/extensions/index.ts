/**
 * PEAC Protocol Extension Schemas (v0.11.3+ ZT Pack)
 *
 * Zero Trust extension schemas for use in ext[] with reverse-DNS keys.
 */

// Credential Event (org.peacprotocol/credential_event)
export {
  CredentialEventTypeSchema,
  CredentialRefSchema,
  CredentialEventSchema,
  CREDENTIAL_EVENT_EXTENSION_KEY,
  CREDENTIAL_EVENTS,
  validateCredentialEvent,
} from './credential-event';
export type { CredentialEventType, CredentialEvent } from './credential-event';

// Tool Registry (org.peacprotocol/tool_registry)
export {
  ToolRegistrySchema,
  TOOL_REGISTRY_EXTENSION_KEY,
  validateToolRegistry,
} from './tool-registry';
export type { ToolRegistry } from './tool-registry';

// Control Action (org.peacprotocol/control_action)
export {
  ControlActionTypeSchema,
  ControlTriggerSchema,
  ControlActionSchema,
  CONTROL_ACTION_EXTENSION_KEY,
  CONTROL_ACTIONS,
  CONTROL_TRIGGERS,
  validateControlAction,
} from './control-action';
export type { ControlActionType, ControlTrigger, ControlAction } from './control-action';

// Treaty (org.peacprotocol/treaty)
export {
  CommitmentClassSchema,
  TreatySchema,
  TREATY_EXTENSION_KEY,
  COMMITMENT_CLASSES,
  validateTreaty,
} from './treaty';
export type { CommitmentClass, Treaty } from './treaty';

// Fingerprint Reference Conversion
export {
  stringToFingerprintRef,
  fingerprintRefToString,
  MAX_FINGERPRINT_REF_LENGTH,
} from './fingerprint-ref';
export type { FingerprintRefObject } from './fingerprint-ref';

// A2A Handoff Observation (org.peacprotocol/a2a-handoff): v0.14.1
export {
  A2A_HANDOFF_EXTENSION_KEY,
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_TASK_EVENT_TYPES,
  A2A_TASK_TYPE_URIS,
  A2A_HANDOFF_TYPE_URIS,
  A2A_TASK_EVENT_SCHEMAS,
  A2A_HANDOFF_ERROR_CODES,
  A2AAgentCardObservationSchema,
  A2ATaskObservationSchema,
  A2AHandoffSchema,
  validateA2AHandoff,
} from './a2a-handoff';
export type {
  A2ATaskEvent,
  A2AAgentCardObservation,
  A2ATaskObservation,
  A2AHandoffPayload,
  A2AValidationError,
  A2AValidationResult,
} from './a2a-handoff';

// CLI Execution Observation (org.peacprotocol/cli-execution)
export {
  CLI_EXECUTION_EXTENSION_KEY,
  CLI_COMMAND_EXECUTION_TYPE,
  CLI_EXECUTION_ERROR_CODES,
  CLI_SCHEMA_LIMITS,
  CliExecutionSchema,
  validateCliExecution,
} from './cli-execution';
export type {
  CliExecutionObservation,
  CliValidationError,
  CliValidationResult,
} from './cli-execution';

// Lifecycle Observation (org.peacprotocol/lifecycle-observation): v0.14.1
export {
  LIFECYCLE_OBSERVATION_EXTENSION_KEY,
  LIFECYCLE_OBSERVATION_TYPE_URIS,
  LIFECYCLE_OBSERVATION_ERROR_CODES,
  FORBIDDEN_TOP_LEVEL_KEYS,
  LifecycleObservationSchema,
  validateLifecycleObservation,
} from './lifecycle-observation';
export type {
  LifecycleEventKind,
  LifecycleObservation,
  LifecycleObservationTypeUri,
  LifecycleValidationError,
  LifecycleValidationResult,
} from './lifecycle-observation';
