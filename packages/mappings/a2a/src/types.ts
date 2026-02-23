/**
 * Minimal A2A types from spec v0.3.0 (DD-126).
 *
 * These types are defined locally rather than importing @a2a-js/sdk,
 * which brings protobuf + gRPC + express peer dependencies that are
 * not needed for evidence placement.
 */

import type { CarrierFormat, PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PEAC traceability extension URI for A2A metadata */
export const PEAC_EXTENSION_URI = 'https://www.peacprotocol.org/ext/traceability/v1' as const;

/** Maximum carrier size for A2A metadata (64 KB, DD-127) */
export const A2A_MAX_CARRIER_SIZE = 65_536;

// ---------------------------------------------------------------------------
// A2A Agent Card types (v0.3.0)
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
    jwks_uri?: string;
  };
}

/** Minimal A2A Agent Card shape (v0.3.0) */
export interface A2AAgentCard {
  name: string;
  url: string;
  capabilities?: {
    extensions?: AgentCardExtension[];
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
