/**
 * Agreement Proposal Types for PEAC Protocol v0.9.6
 * 
 * Represents the structure of agreement proposals submitted for creation.
 * These are transformed into Agreement resources upon successful validation.
 */

export type UsageCategory = 'training' | 'inference' | 'analytics' | 'display' | 'cache';

/**
 * Pricing policy for agreement terms
 */
export interface PricingPolicy {
  /** Minor currency units as decimal-free string (e.g., "2500" for $25.00) */
  price: string;
  /** Currency code (ISO 4217) - defaults to USD if not specified */
  currency?: string;
  /** Duration in seconds */
  duration: number;
  /** Usage category */
  usage: UsageCategory;
}

/**
 * Consent requirements and configuration
 */
export interface ConsentConfig {
  /** Whether explicit consent is required */
  required: boolean;
  /** Consent mechanism (e.g., "click-through", "signature", "api-acknowledgment") */
  mechanism?: string;
  /** Additional consent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Attribution requirements and configuration
 */
export interface AttributionConfig {
  /** Whether attribution is required */
  required: boolean;
  /** Attribution text if required */
  text?: string;
  /** Attribution placement requirements (e.g., "footer", "sidebar", "inline") */
  placement?: string;
}

/**
 * Terms and conditions configuration
 */
export interface TermsConfig {
  /** Terms text or reference */
  text: string;
  /** Terms URL for external reference */
  url?: string;
  /** Version of terms */
  version?: string;
}

/**
 * Agreement proposal submitted for creation
 * 
 * This represents the input to POST /peac/agreements endpoint.
 * Upon successful creation, this becomes the 'proposal' field in an Agreement resource.
 */
export interface AgreementProposal {
  /** Purpose of the agreement (human-readable description) */
  purpose: string;
  
  /** Consent requirements and terms */
  consent: ConsentConfig;
  
  /** Attribution requirements */
  attribution: AttributionConfig;
  
  /** Pricing policy for this agreement */
  pricing_policy: PricingPolicy;
  
  /** Agreement terms and conditions */
  terms: TermsConfig;
  
  /** Additional metadata (extensible for future use) */
  metadata?: Record<string, unknown>;
}

/**
 * Type guard to validate if object is a valid AgreementProposal
 */
export function isAgreementProposal(obj: unknown): obj is AgreementProposal {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AgreementProposal).purpose === 'string' &&
    typeof (obj as AgreementProposal).consent === 'object' &&
    typeof (obj as AgreementProposal).attribution === 'object' &&
    typeof (obj as AgreementProposal).pricing_policy === 'object' &&
    typeof (obj as AgreementProposal).terms === 'object'
  );
}