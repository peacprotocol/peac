/**
 * PEAC Protocol v0.9.11 Types
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

/**
 * PEAC Policy v0.9.11 Types
 */

export interface PolicySite {
  name: string;
  domain: string;
  contact?: string;
}

export interface PolicyAttribution {
  format?: string;
  required?: boolean;
}

export interface PolicyPrivacy {
  retention_days?: number;
}

export interface PolicyLogging {
  sink?: string;
}

export interface PolicyExports {
  enabled?: boolean;
  auth?: 'signature' | 'token';
  max_rows?: number;
}

export interface PolicyRateLimits {
  anonymous?: number;
  attributed?: number;
  verified?: number;
}

export interface PolicyReceipts {
  mode?: 'disabled' | 'optional' | 'required';
  hosted?: boolean;
}

export interface PolicyWebBotAuth {
  accepted?: boolean;
}

export interface PolicyIdentity {
  web_bot_auth?: PolicyWebBotAuth;
}

/**
 * PEAC Policy structure for v0.9.11
 */
export interface Policy {
  version: string;
  site: PolicySite;
  attribution?: PolicyAttribution;
  privacy?: PolicyPrivacy;
  logging?: PolicyLogging;
  exports?: PolicyExports;
  heavy_paths?: string[];
  rate_limits?: PolicyRateLimits;
  receipts?: PolicyReceipts;
  identity?: PolicyIdentity;
}

/**
 * Check if an object is a valid policy
 */
export function isPolicyValid(obj: unknown): obj is Policy {
  if (!obj || typeof obj !== 'object') return false;
  const policy = obj as Record<string, unknown>;

  // Required fields
  if (typeof policy.version !== 'string') return false;
  if (!policy.site || typeof policy.site !== 'object') return false;

  const site = policy.site as Record<string, unknown>;
  if (typeof site.name !== 'string' || typeof site.domain !== 'string') return false;

  return true;
}

/**
 * Validate policy attribution format regex
 */
export function validateAttributionFormat(format: string): boolean {
  try {
    new RegExp(format);
    return true;
  } catch {
    return false;
  }
}
