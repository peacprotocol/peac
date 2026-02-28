/**
 * PEAC Protocol Extension Schemas (v0.11.3+, DD-145 ZT Pack)
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

// Fingerprint Reference Conversion (DD-146)
export { stringToFingerprintRef, fingerprintRefToString } from './fingerprint-ref';
export type { FingerprintRefObject } from './fingerprint-ref';
