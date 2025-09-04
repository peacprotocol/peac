/**
 * @peac/core v0.9.12 - Ultra-lean types
 * Minimal, terse names for byte efficiency
 */

export type Kid = string;
export type KeySet = Record<Kid, { kty: 'OKP'; crv: 'Ed25519'; x: string }>;

// Core Receipt v1 (ADR-002 compliant)
export interface Rec {
  subject: { 
    uri?: string; 
    hash?: { alg: string; val: string } 
  };
  agent?: { 
    id?: string 
  };
  // ADR-002: AIPREF object ALWAYS present
  aipref: {
    status: 'active' | 'not_found' | 'error' | 'not_applicable';
    checked_at: string; // ISO 8601 UTC
    snapshot?: unknown; // JCS-canonicalized when present
    digest?: { alg: 'JCS-SHA256'; val: string };
    reason?: string; // Error details
  };
  enforcement: {
    method: 'http-402' | 'none' | string;
    status?: 'fulfilled' | 'required';
  };
  // ADR-002: payment REQUIRED when enforcement.method=="http-402"
  payment?: {
    rail: 'l402' | 'x402' | 'stripe' | string;
    amount?: { value: string; currency: string };
    status?: string;
    evidence?: { provider_ids?: string[] };
  };
  issued_at: string; // ISO 8601
  kid: string;
  // Extensions namespace (open world)
  ext?: Record<string, unknown>;
}

export interface Pref {
  status: 'active' | 'not_found' | 'error' | 'not_applicable';
  checked_at: string;
  snapshot?: unknown;
  digest?: { alg: 'JCS-SHA256'; val: string };
  reason?: string;
}

export interface SignOpts {
  kid: Kid;
  privateKey: { kty: 'OKP'; crv: 'Ed25519'; d: string; [key: string]: unknown };
}

export interface VerifyResult {
  hdr: { alg: 'EdDSA'; kid: Kid; typ?: string };
  obj: Rec;
}