/**
 * @peac/mappings-a2a
 *
 * Agent-to-Agent Protocol (A2A) integration for PEAC.
 * Maps PEAC evidence carriers to A2A metadata (TaskStatus, Message, Artifact)
 * per A2A spec v0.3.0 (DD-126, DD-128).
 */

// Types
export type {
  AgentCardExtension,
  AgentCardPeacExtension,
  A2AAgentCard,
  A2AMetadata,
  A2ATaskStatusLike,
  A2AMessageLike,
  A2AArtifactLike,
  A2APeacPayload,
} from './types';

export { PEAC_EXTENSION_URI, A2A_MAX_CARRIER_SIZE } from './types';

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
