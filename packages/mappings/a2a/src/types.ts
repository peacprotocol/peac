/**
 * A2A v1.0.0 types.
 *
 * These types are defined locally rather than importing @a2a-js/sdk,
 * which brings protobuf + gRPC + express peer dependencies that are
 * not needed for evidence placement.
 *
 * A2A v0.3.0 compatibility (DD-186) was deprecated in v0.12.3 and
 * removed in v0.13.0 (DD-186 removal target honored). Agent Cards
 * carrying only a top-level `url` (the v0.3.0 shape) are no longer
 * accepted; every card must expose `supportedInterfaces[0].url`.
 * TaskState values must use the v1.0.0 prefixed SCREAMING_SNAKE_CASE
 * form; v0.3.0 kebab-case values are no longer mapped.
 */

import type { CarrierFormat, PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PEAC traceability extension URI for A2A metadata */
export const PEAC_EXTENSION_URI = 'https://www.peacprotocol.org/ext/traceability/v1' as const;

/** Maximum carrier size for A2A metadata (64 KB) */
export const A2A_MAX_CARRIER_SIZE = 65_536;

// ---------------------------------------------------------------------------
// A2A Agent Card types (v1.0.0)
// ---------------------------------------------------------------------------

/** A2A extension entry in capabilities.extensions[] */
export interface AgentCardExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

/** PEAC-specific extension entry for A2A Agent Card */
export interface AgentCardPeacExtension {
  uri: typeof PEAC_EXTENSION_URI;
  description: string;
  required: boolean;
  params?: {
    supported_kinds?: string[];
    carrier_formats?: CarrierFormat[];
    issuer_config_url?: string;
  };
}

/** A2A v1.0.0 supported interface entry */
export interface A2ASupportedInterface {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
}

/**
 * Minimal A2A Agent Card shape (v1.0.0).
 *
 * v1.0.0 cards expose endpoint bindings via `supportedInterfaces[]`.
 * Every accepted card MUST carry a non-empty `supportedInterfaces[0].url`.
 * The legacy v0.3.0 top-level `url` field was accepted through v0.12.x
 * with a deprecation warning and removed in v0.13.0 (DD-186).
 */
export interface A2AAgentCard {
  name: string;
  supportedInterfaces?: A2ASupportedInterface[];
  capabilities?: {
    extensions?: AgentCardExtension[];
    extendedAgentCard?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// A2A message types (minimal shapes)
// ---------------------------------------------------------------------------

/** A2A metadata map */
export type A2AMetadata = Record<string, unknown>;

/** Minimal A2A TaskStatus shape */
export interface A2ATaskStatusLike {
  state: string;
  metadata?: A2AMetadata;
  [key: string]: unknown;
}

/** Minimal A2A Message shape */
export interface A2AMessageLike {
  role: string;
  parts: unknown[];
  metadata?: A2AMetadata;
  [key: string]: unknown;
}

/** Minimal A2A Artifact shape */
export interface A2AArtifactLike {
  artifactId: string;
  parts: unknown[];
  metadata?: A2AMetadata;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// A2A v1.0.0 enum constants (reference values)
// ---------------------------------------------------------------------------

/** A2A v1.0.0 TaskState values (SCREAMING_SNAKE_CASE with type prefix) */
export const A2A_V1_TASK_STATE = {
  SUBMITTED: 'TASK_STATE_SUBMITTED',
  WORKING: 'TASK_STATE_WORKING',
  COMPLETED: 'TASK_STATE_COMPLETED',
  FAILED: 'TASK_STATE_FAILED',
  CANCELED: 'TASK_STATE_CANCELED',
  REJECTED: 'TASK_STATE_REJECTED',
  INPUT_REQUIRED: 'TASK_STATE_INPUT_REQUIRED',
  AUTH_REQUIRED: 'TASK_STATE_AUTH_REQUIRED',
} as const;

/** A2A v1.0.0 MessageRole values */
export const A2A_V1_MESSAGE_ROLE = {
  USER: 'ROLE_USER',
  AGENT: 'ROLE_AGENT',
} as const;

// The v0.3.0 → v1.0.0 TaskState mapping (previously TASK_STATE_V03_TO_V1)
// was removed in v0.13.0 alongside the v0.3.0 compat path (DD-186).
// Callers MUST supply v1.0.0 TaskState values directly.

// ---------------------------------------------------------------------------
// Carrier payload type
// ---------------------------------------------------------------------------

/**
 * A2A carrier payload: the value stored under metadata[PEAC_EXTENSION_URI].
 *
 * Contains an array of carriers (even for single-receipt cases) and
 * optional transport metadata.
 */
export interface A2APeacPayload {
  carriers: PeacEvidenceCarrier[];
  meta?: CarrierMeta;
}
