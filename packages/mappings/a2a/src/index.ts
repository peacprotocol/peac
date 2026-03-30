/**
 * @peac/mappings-a2a
 *
 * Agent-to-Agent Protocol (A2A) integration for PEAC.
 * Maps PEAC evidence carriers to A2A metadata (TaskStatus, Message, Artifact).
 * Supports both A2A v0.3.0 and v1.0.0 (DD-186 dual-version transition).
 */

// Types
export type {
  AgentCardExtension,
  AgentCardPeacExtension,
  A2AAgentCard,
  A2ASupportedInterface,
  A2AMetadata,
  A2ATaskStatusLike,
  A2AMessageLike,
  A2AArtifactLike,
  A2APeacPayload,
} from './types';

export {
  PEAC_EXTENSION_URI,
  A2A_MAX_CARRIER_SIZE,
  A2A_V1_TASK_STATE,
  A2A_V1_MESSAGE_ROLE,
  TASK_STATE_V03_TO_V1,
} from './types';

// Normalizers (DD-186: v0.3.0 + v1.0.0 dual-version)
export type { NormalizedAgentCard } from './normalizers';

export {
  isV1AgentCard,
  normalizeAgentCard,
  selectBestInterface,
  normalizeTaskState,
  _resetDeprecationWarning,
} from './normalizers';

// Attach
export {
  attachReceiptToMetadata,
  attachReceiptToTaskStatus,
  attachReceiptToMessage,
  attachReceiptToArtifact,
} from './attach';

// Extract
export type { A2AExtractResult, A2AExtractAsyncResult } from './extract';

export {
  extractReceiptFromMetadata,
  extractReceiptFromMetadataAsync,
  extractReceiptFromTaskStatus,
  extractReceiptFromTaskStatusAsync,
  extractReceiptFromMessage,
  extractReceiptFromMessageAsync,
  extractReceiptFromArtifact,
  extractReceiptFromArtifactAsync,
} from './extract';

// Carrier adapter
export { A2ACarrierAdapter, createA2ACarrierMeta } from './carrier';

// Header utilities
export { parseA2AExtensionsHeader, buildA2AExtensionsHeader } from './header';

// Discovery
export type { DiscoveryOptions, PeacDiscoverySource, PeacDiscoveryResult } from './discovery';

export {
  discoverAgentCard,
  hasPeacExtension,
  getPeacExtension,
  discoverPeacCapabilities,
} from './discovery';

// Auth (A2A v1.0 OAuth surface)
export {
  generatePKCEChallenge,
  computeS256Challenge,
  validatePKCEVerifier,
  buildAuthorizationRequest,
  exchangeAuthorizationCode,
  fromA2AAuthEvent,
  GrpcStatusCode,
  createA2AAuthStatus,
} from './auth/index';

export type {
  PKCEChallenge,
  A2AOAuthConfig,
  AuthorizationRequest,
  TokenResponse,
  FetchFn,
  A2ADeviceCodeFlowConfig,
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceCodePollingError,
  DeviceCodeErrorResponse,
  DeviceCodeTokenResponse,
  A2AAuthMethod,
  A2AAuthEvent,
  A2AAuthEvidenceResult,
  GrpcStatusCodeValue,
  GrpcErrorInfo,
  GrpcStatus,
  A2AAuthErrorCode,
} from './auth/index';
