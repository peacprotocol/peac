/**
 * A2A types supporting both v0.3.0 and v1.0.0.
 *
 * These types are defined locally rather than importing @a2a-js/sdk,
 * which brings protobuf + gRPC + express peer dependencies that are
 * not needed for evidence placement.
 *
 * v1.0.0 transition (DD-186): dual-version acceptance with v0.3.0
 * deprecated via process.emitWarning(). v0.3.0 removal at v0.13.0.
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
// A2A Agent Card types (v0.3.0 + v1.0.0)
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
 * Minimal A2A Agent Card shape (v0.3.0 + v1.0.0).
 *
 * v0.3.0 cards have top-level `url`. v1.0.0 cards replace it with
 * `supportedInterfaces[]`. Both shapes are accepted; v0.3.0 emits
 * a deprecation warning. v0.3.0 support removal at v0.13.0.
 */
export interface A2AAgentCard {
  name: string;
  /** @deprecated v0.3.0 field. Use supportedInterfaces[0].url in v1.0.0. */
  url?: string;
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

/** Map from v0.3.0 kebab-case task states to v1.0.0 prefixed form */
export const TASK_STATE_V03_TO_V1: Record<string, string> = {
  submitted: A2A_V1_TASK_STATE.SUBMITTED,
  working: A2A_V1_TASK_STATE.WORKING,
  completed: A2A_V1_TASK_STATE.COMPLETED,
  failed: A2A_V1_TASK_STATE.FAILED,
  canceled: A2A_V1_TASK_STATE.CANCELED,
  rejected: A2A_V1_TASK_STATE.REJECTED,
  'input-required': A2A_V1_TASK_STATE.INPUT_REQUIRED,
  'auth-required': A2A_V1_TASK_STATE.AUTH_REQUIRED,
};

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
