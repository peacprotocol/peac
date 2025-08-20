// PEAC Protocol v0.9.6 Schema definitions
export const PEAC_VERSION = '0.9.6';
export const SCHEMA_VERSION = '0.9.6';

// Import Agreement types from separate files
export type { Agreement, AgreementStatus, AgreementInvalidReason } from './Agreement';
export type { 
  AgreementProposal, 
  PricingPolicy, 
  ConsentConfig, 
  AttributionConfig, 
  TermsConfig,
  UsageCategory 
} from './AgreementProposal';

/**
 * Agreement-First API Types for PEAC Protocol v0.9.6
 */

// Types moved to separate files to avoid conflicts

// Agreement interface moved to Agreement.ts to avoid conflicts

/**
 * Payment charge request requiring agreement binding
 */
export interface PaymentChargeRequest {
  /** Amount in minor currency units */
  amount: string;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Agreement ID this payment relates to */
  agreement_id: string;
  /** Payment metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Payment receipt with agreement reference
 */
export interface PaymentReceipt {
  /** Payment ID */
  id: string;
  /** Amount charged */
  amount: string;
  /** Currency code */
  currency: string;
  /** Associated agreement ID */
  agreement_id: string;
  /** Optional agreement fingerprint for verification */
  agreement_fingerprint?: string;
  /** Payment timestamp */
  created_at: string;
  /** Payment status */
  status: 'pending' | 'completed' | 'failed';
  /** Additional receipt metadata */
  metadata?: Record<string, unknown>;
}
