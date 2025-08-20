/**
 * Agreement Resource Types for PEAC Protocol v0.9.6
 * 
 * Represents created agreement resources with immutable fingerprints and status tracking.
 * These are returned from POST /peac/agreements and GET /peac/agreements/{id} endpoints.
 */

import { AgreementProposal } from './AgreementProposal';

/**
 * Agreement status enumeration
 */
export type AgreementStatus = 'valid' | 'invalid';

/**
 * Reason codes for invalid agreements
 */
export type AgreementInvalidReason = 'expired' | 'revoked' | 'suspended' | 'malformed';

/**
 * Agreement resource (created from proposal)
 * 
 * This represents the persistent agreement entity with immutable fingerprint
 * and status tracking. The fingerprint is computed from the canonical JSON
 * representation of the proposal (sorted keys, no whitespace).
 */
export interface Agreement {
  /** Agreement ID with agr_ prefix (agr_<ulid>) */
  id: string;
  
  /** SHA256 fingerprint of canonical proposal JSON */
  fingerprint: string;
  
  /** Protocol version used to create this agreement */
  protocol_version: string;
  
  /** Current agreement status */
  status: AgreementStatus;
  
  /** Reason if status is invalid */
  reason?: AgreementInvalidReason;
  
  /** Creation timestamp (ISO 8601) */
  created_at: string;
  
  /** Expiration timestamp (ISO 8601) if applicable */
  expires_at?: string;
  
  /** Immutable snapshot of original proposal */
  proposal: AgreementProposal;
}

/**
 * Partial agreement for updates (limited fields)
 */
export interface AgreementUpdate {
  /** Status can be updated */
  status?: AgreementStatus;
  
  /** Reason for status change */
  reason?: AgreementInvalidReason;
  
  /** Expiration can be set/updated */
  expires_at?: string;
}

/**
 * Agreement creation response metadata
 */
export interface AgreementCreationMeta {
  /** Computed fingerprint for verification */
  fingerprint: string;
  
  /** Validation warnings (non-blocking) */
  warnings?: string[];
  
  /** Processing time in milliseconds */
  processing_time_ms?: number;
}

/**
 * Type guard to validate if object is a valid Agreement
 */
export function isAgreement(obj: unknown): obj is Agreement {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Agreement).id === 'string' &&
    (obj as Agreement).id.startsWith('agr_') &&
    typeof (obj as Agreement).fingerprint === 'string' &&
    typeof (obj as Agreement).protocol_version === 'string' &&
    ['valid', 'invalid'].includes((obj as Agreement).status) &&
    typeof (obj as Agreement).created_at === 'string' &&
    typeof (obj as Agreement).proposal === 'object'
  );
}

/**
 * Utility to extract agreement ID from various contexts
 */
export function extractAgreementId(source: string | Agreement | { agreement_id: string }): string | null {
  if (typeof source === 'string') {
    return source.startsWith('agr_') ? source : null;
  }
  
  if ('id' in source && typeof source.id === 'string') {
    return source.id.startsWith('agr_') ? source.id : null;
  }
  
  if ('agreement_id' in source && typeof source.agreement_id === 'string') {
    return source.agreement_id.startsWith('agr_') ? source.agreement_id : null;
  }
  
  return null;
}

/**
 * Check if agreement is currently valid (status + expiration)
 */
export function isAgreementValid(agreement: Agreement): boolean {
  if (agreement.status !== 'valid') {
    return false;
  }
  
  if (agreement.expires_at) {
    const expirationTime = new Date(agreement.expires_at).getTime();
    const currentTime = Date.now();
    return currentTime < expirationTime;
  }
  
  return true;
}