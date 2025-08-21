/**
 * PEAC Protocol v0.9.6 Types
 * Core type definitions for the PEAC Protocol
 */

/**
 * Agreement status values
 */
export type AgreementStatus = 'valid' | 'invalid';

/**
 * Reasons why an agreement might be invalid
 */
export type AgreementInvalidReason = 
  | 'expired'
  | 'revoked'
  | 'malformed'
  | 'unauthorized'
  | 'duplicate';

/**
 * Agreement proposal structure
 */
export interface AgreementProposal {
  id: string;
  fingerprint: string;
  status: AgreementStatus;
  expires_at?: string;
  created_at: string;
  updated_at?: string;
  reason?: AgreementInvalidReason;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agreement structure (validated proposal)
 */
export interface Agreement extends AgreementProposal {
  status: AgreementStatus;
  reason?: AgreementInvalidReason;
  protocol_version?: string;
  proposal?: AgreementProposal;
}

/**
 * Payment charge request
 */
export interface PaymentChargeRequest {
  amount: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Payment receipt
 */
export interface PaymentReceipt {
  id: string;
  amount: string;
  currency: string;
  agreement_id: string;
  agreement_fingerprint: string;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
}

/**
 * Check if an object is an agreement proposal
 */
export function isAgreementProposal(obj: unknown): obj is AgreementProposal {
  if (!obj || typeof obj !== 'object') return false;
  const proposal = obj as Record<string, unknown>;
  return (
    typeof proposal.id === 'string' &&
    typeof proposal.fingerprint === 'string' &&
    (proposal.status === 'valid' || proposal.status === 'invalid')
  );
}

/**
 * Check if an agreement is valid (status and expiration)
 */
export function isAgreementValid(agreement: Agreement): boolean {
  if (agreement.status !== 'valid') return false;
  if (!agreement.expires_at) return true;
  
  const now = new Date();
  const expiresAt = new Date(agreement.expires_at);
  return expiresAt > now;
}

/**
 * Extract agreement ID from header value
 */
export function extractAgreementId(headerValue: string): string | null {
  if (!headerValue) return null;
  
  // Handle "agr_<ulid>" format
  const match = headerValue.match(/^agr_[0-9A-Z]{26}$/i);
  return match ? headerValue : null;
}