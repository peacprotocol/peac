/**
 * @peac/core v0.9.14 - Enhanced types with v0.9.14 wire format
 * Single Receipt type with typ: "peac.receipt/0.9", iat field, payment.scheme
 */

export type Kid = string;
export type CrawlerType = 'bot' | 'agent' | 'hybrid' | 'unknown';

export type Ed25519PrivateJwk = {
  kty: 'OKP';
  crv: 'Ed25519';
  d: string;
  x?: string;
  alg?: 'EdDSA';
  kid?: string;
};

export interface SigningOptions {
  kid: string;
  privateKey: Ed25519PrivateJwk;
}

export type KeySet = Record<Kid, { kty: 'OKP'; crv: 'Ed25519'; x: string; d?: string }>;
export type VerifyKeySet = Record<
  string,
  { kty: 'OKP'; crv: 'Ed25519'; x: string; alg?: 'EdDSA'; kid?: string }
>;

// Core Receipt v0.9.14 (wire format peac.receipt/0.9)
export interface Receipt {
  version: '0.9.14';
  protocol_version: string;
  wire_version: '0.9';
  subject: {
    uri: string;
    content_hash?: string;
    rights_class?:
      | 'book'
      | 'lyrics'
      | 'article'
      | 'image'
      | 'audio'
      | 'video'
      | 'dataset'
      | 'software'
      | 'other';
    sku?: string;
  };
  aipref: {
    status: 'allowed' | 'denied' | 'conditional' | 'not_found' | 'error';
    snapshot?: string;
    digest?: string;
    source?: string;
  };
  purpose: 'train-ai' | 'train-genai' | 'search' | 'evaluation' | 'other';
  enforcement: {
    method: 'none' | 'http-402' | 'subscription' | 'license';
    provider?: 'cdn' | 'origin' | 'gateway';
    challenge?: Record<string, unknown>;
  };
  payment?: {
    scheme: 'stripe' | 'l402' | 'x402';
    amount: number;
    currency: string;
    evidence?: {
      provider_ids?: string[];
      proof?: string;
    };
  };
  acquisition?: {
    method: 'purchase' | 'subscription' | 'license' | 'public_domain' | 'fair_use' | 'consent';
    source: string;
    license?: string;
    timestamp?: string;
  };
  legal?: {
    basis?: 'fair_use' | 'license' | 'public_domain' | 'consent' | 'legitimate_interest';
    jurisdiction?: string;
    reference?: string;
  };
  attribution?: {
    required?: boolean;
    format_applied?: boolean;
    url?: string;
    license?: string;
  };
  consent?: {
    basis?:
      | 'consent'
      | 'contract'
      | 'legal_obligation'
      | 'legitimate_interest'
      | 'public_task'
      | 'vital_interest'
      | 'not_applicable';
    retention?: string;
  };
  provenance?: {
    c2pa?: string;
  };
  metrics?: {
    bytes?: number;
    tokens?: number;
    duration_ms?: number;
  };
  crawler_type: CrawlerType;
  verification?: {
    ip_verified?: boolean;
    rdns_match?: boolean;
    user_agent_consistent?: boolean;
    stealth_indicators?: string[];
    trust_score?: number;
  };
  audit_chain?: {
    previous_receipt?: string;
    merkle_root?: string;
    witnesses?: string[];
    anchor?: string;
  };
  request_context?: {
    request_id?: string;
    session_id?: string;
    correlation_id?: string;
    timestamp?: string;
  };
  iat: number;
  exp?: number;
  kid: string;
  nonce?: string;
}

// Purge Receipt v1.0 (wire format purge@1.0)
export interface PurgeReceipt {
  version: '1.0';
  protocol_version: string;
  wire_version: '1.0';
  action: 'purge';
  subject: {
    uri: string;
    rights_class?: string;
    content_hash?: string;
  };
  corpus: {
    id: string;
    version?: string;
    hash?: string;
    size_bytes?: number;
  };
  erasure_basis?: 'gdpr' | 'ccpa' | 'contractual' | 'other';
  performed_by?: string;
  performed_at: string;
  evidence?: Record<string, unknown>;
  request_context?: {
    request_id?: string;
    session_id?: string;
    correlation_id?: string;
    timestamp?: string;
  };
  kid: string;
  nonce?: string;
  signature_media_type: 'application/peac-purge+jws';
}

// Discovery Document v1.1 (wire format discovery@1.1)
export interface Discovery {
  version: '1.1';
  preferences: string;
  access_control: 'http-402' | 'none';
  payments: ('stripe' | 'l402' | 'x402')[];
  provenance?: 'c2pa' | 'none';
  receipts: 'required' | 'optional';
  verify: string;
  public_keys: Array<{
    kid: string;
    alg: 'EdDSA';
    key: string;
  }>;
  access_modes?: {
    bot?: {
      policy?: 'block' | 'allow' | 'paid' | 'challenge';
      pricing?: {
        model?: 'per_gb' | 'per_request' | 'per_token' | 'flat_rate';
        rate?: number;
        currency?: string;
      };
      rate_limit?: number;
      require_license?: boolean;
    };
    agent?: {
      policy?: 'allow_realtime' | 'block' | 'paid';
      constraints?: {
        no_storage?: boolean;
        user_attribution?: boolean;
        session_timeout?: number;
      };
    };
  };
  crawler_verification?: {
    require_rdns?: boolean;
    known_crawlers?: Array<{
      name: string;
      ip_ranges?: string[];
      user_agents?: string[];
      verification_url?: string;
      rdns_suffixes?: string[];
    }>;
    stealth_detection?: {
      enabled?: boolean;
      block_suspicious?: boolean;
      challenge_unknown?: boolean;
    };
  };
  compatibility_bridges?: {
    robots_txt?: boolean;
    ai_robots_txt?: boolean;
    cloudflare_compatible?: boolean;
    perplexity_compatible?: boolean;
  };
  rate_limits?: {
    default_rpm?: number;
    burst_allowance?: number;
    window_size?: string;
  };
}

// Verification Results
export interface VerificationResult {
  ip_verified: boolean;
  rdns_match: boolean;
  user_agent_consistent: boolean;
  stealth_indicators: string[];
  trust_score: number;
  rdns_details: {
    forward_hostname?: string;
    reverse_ips?: string[];
    match: boolean;
    suffix_ok: boolean;
  };
}

// Trust Scoring
export interface TrustScoreParams {
  rdns_match: boolean;
  ip_in_range: boolean;
  user_agent_valid: boolean;
  rate_compliant: boolean;
}

// Problem Details (RFC 9457)
export interface ProblemDetails {
  status: number;
  headers: Record<string, string>;
  body: {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    [key: string]: unknown;
  };
}

// Legacy compatibility (deprecated)
export type Rec = Receipt;
export type Pref = Pick<Receipt['aipref'], 'status' | 'snapshot' | 'digest'>;

export interface SignOpts {
  kid: Kid;
  privateKey: { kty: 'OKP'; crv: 'Ed25519'; d: string; x?: string };
}

export interface VerifyResult {
  hdr: { alg: 'EdDSA'; kid: Kid; typ?: string };
  receipt: Receipt;
}
