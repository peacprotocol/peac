/**
 * PEAC Envelope Types (v0.9.15+)
 *
 * These types match the normative JSON Schema (PEAC-RECEIPT-SCHEMA-v0.9.json).
 * The envelope is the canonical structure for PEAC receipts.
 */

import type { ControlBlock } from './control';
import type { PaymentEvidence, AttestationEvidence } from './evidence';

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
}

export interface EnforcementContext {
  method: string;
  details?: Record<string, unknown>;
}

export interface TransportBinding {
  transport: string;
  method: string;
  evidence?: Record<string, unknown>;
}

export interface ContextMetadata {
  resource?: string;
  method?: string;
  [key: string]: unknown;
}

export interface EvidenceBlock {
  payment?: PaymentEvidence;
  attestation?: AttestationEvidence;
  payments?: PaymentEvidence[];
}

export interface MetadataBlock {
  redactions?: string[];
  privacy_budget?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * PEAC Envelope - normative structure for v0.9.15+
 */
export interface PEACEnvelope {
  auth: AuthContext;
  evidence?: EvidenceBlock;
  meta?: MetadataBlock;
}
