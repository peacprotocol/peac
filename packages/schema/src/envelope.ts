/**
 * PEAC Envelope Types (v0.9.15+)
 *
 * These types match the normative JSON Schema (PEAC-RECEIPT-SCHEMA-v0.9.json).
 * The envelope is the canonical structure for PEAC receipts.
 */

import type { JsonObject, JsonValue } from '@peac/kernel';
import type { ControlBlock } from './control';
import type { PaymentEvidence, AttestationEvidence, Attestation, Extensions } from './evidence';
import type { SubjectProfileSnapshot } from './subject';

/**
 * Authentication and Authorization Context
 */
export interface AuthContext {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp?: number;
  rid: string;
  policy_hash: string;
  policy_uri: string;
  control?: ControlBlock;
  enforcement?: EnforcementContext;
  binding?: TransportBinding;
  ctx?: ContextMetadata;
  /** Subject profile snapshot for policy evaluation (v0.9.17+) */
  subject_snapshot?: SubjectProfileSnapshot;
  /** Namespaced extensions (v0.9.21+) */
  extensions?: Extensions;
}

export interface EnforcementContext {
  method: string;
  details?: JsonObject;
}

export interface TransportBinding {
  transport: string;
  method: string;
  evidence?: JsonObject;
}

export interface ContextMetadata {
  resource?: string;
  method?: string;
  [key: string]: JsonValue | undefined;
}

export interface EvidenceBlock {
  payment?: PaymentEvidence;
  attestation?: AttestationEvidence;
  payments?: PaymentEvidence[];
  /** Generic attestations (v0.9.21+) */
  attestations?: Attestation[];
  /** Namespaced extensions (v0.9.21+) */
  extensions?: Extensions;
}

export interface MetadataBlock {
  redactions?: string[];
  privacy_budget?: JsonObject;
  debug?: JsonObject;
  [key: string]: JsonValue | undefined;
}

/**
 * PEAC Envelope - normative structure for v0.9.15+
 */
export interface PEACEnvelope {
  auth: AuthContext;
  evidence?: EvidenceBlock;
  meta?: MetadataBlock;
}
