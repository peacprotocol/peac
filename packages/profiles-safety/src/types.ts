/**
 * Types for PEIP-SAF safety profiles and events
 */

export interface SafetyIntent {
  key: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  keywords?: string[];
}

export interface SafetyEvent {
  event_type:
    | 'disclosure'
    | 'crisis_referral'
    | 'minor_protection'
    | 'intent_classification'
    | 'policy_violation'
    | 'safety_action';
  timestamp: number;
  counters: {
    total_events: number;
    severity_counts?: {
      low?: number;
      medium?: number;
      high?: number;
      critical?: number;
    };
    time_window?: string;
  };
  intent_key?: string;
  action_taken?:
    | 'none'
    | 'warning_displayed'
    | 'content_filtered'
    | 'access_restricted'
    | 'escalated'
    | 'reported';
}

export interface SafetyEventReceipt {
  '@type': 'PEACReceipt/SafetyEvent';
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  rid: string;
  policy_hash: string;
  safety_event: SafetyEvent;
  prefs_url?: string;
  prefs_hash?: string;
  purpose?: string;
  payment?: {
    rail: string;
    reference: string;
    amount: number;
    currency: string;
    settled_at: number;
    idempotency: string;
  };
  trace_id?: string;
  compliance?: {
    gdpr_applicable?: boolean;
    ccpa_applicable?: boolean;
    ai_act_applicable?: boolean;
    jurisdiction?: string;
  };
}

export type OverlayId = 'us-ca-sb243' | string;

export interface SafetyPolicyBase {
  version: 'v1';
  disclosure_cadence: {
    enabled: boolean;
    interval: string;
    grace_period?: string;
  };
  crisis_referral: {
    enabled: boolean;
    keywords: string[];
    referral_url?: string;
    contact_info?: string;
  };
  minors_gate: {
    enabled: boolean;
    min_age: number;
    parental_consent?: boolean;
    age_verification_method?:
      | 'self_attestation'
      | 'credit_card'
      | 'id_verification'
      | 'third_party';
  };
  intent_keys: SafetyIntent[];
  effective_date?: string;
  expires_at?: string;
}

export interface SafetyPolicyCore extends SafetyPolicyBase {
  profile: 'peip-saf/core';
}

export interface SafetyPolicySB243 extends SafetyPolicyBase {
  profile: 'peip-saf/us-ca-sb243';
  jurisdiction: 'US-CA';
  sb243_compliance: {
    enabled: true;
    designated_contact: {
      name: string;
      email: string;
      phone?: string;
    };
    reporting_mechanism: {
      available: true;
      anonymous_option: boolean;
      response_timeframe?: string;
    };
  };
  osp_report_url: string;
  transparency_report?: {
    enabled?: boolean;
    frequency?: 'quarterly' | 'biannually' | 'annually';
    metrics_included?: Array<
      'total_reports' | 'action_taken' | 'response_time' | 'policy_violations' | 'appeals_processed'
    >;
  };
}

export type SafetyPolicy = SafetyPolicyCore | SafetyPolicySB243;
