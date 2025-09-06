/**
 * Enhanced Receipt Schema v1.1 with verification and security fields
 */
export interface Receipt {
  // Core fields
  protocol_version: string; // Pattern: ^\d+\.\d+\.\d+(\.\d+)?
  wire_version: string; // Pattern: ^\d+\.\d+
  subject: {
    uri: string; // Changed from 'id' to 'uri' for clarity
    hash?: string; // SHA-256 of content
  };
  agent: {
    ua?: string;
    attestation?: object;
  };
  aipref: {
    status: 'ok' | 'not_found' | 'error' | 'not_applicable';
    snapshot?: string; // Inline preferences
    digest?: string; // SHA-256 of preferences
  };
  enforcement: {
    method: 'none' | 'http-402';
    provider?: 'cdn' | 'origin' | 'gateway';
  };
  payment?: {
    // Required if method == 'http-402'
    rail: string;
    amount: number;
    currency: string;
    evidence: {
      provider_ids: string[];
      proof?: string;
    };
  };
  provenance?: {
    c2pa?: string;
  };
  consent?: {
    basis?: string;
  };
  
  // Enhanced v1.1 fields
  verification?: {
    crawler_result?: CrawlerVerificationResult;
    trust_score?: number;
    risk_factors?: string[];
  };
  security?: {
    replay_token?: string;
    key_rotation_epoch?: number;
    audit_trail?: AuditEntry[];
  };
  
  // Required context fields
  request_context: {
    request_id: string;
    session_id?: string;
    correlation_id?: string;
    timestamp: string; // ISO 8601 date-time
  };
  
  crawler_type: 'bot' | 'agent' | 'hybrid' | 'browser' | 'migrating' | 'test' | 'unknown';
  issued_at: string; // ISO 8601
  kid: string;
  signature_media_type: 'application/peac-receipt+jws';
}

export interface CrawlerVerificationResult {
  result: 'legitimate' | 'suspicious' | 'bot' | 'local_fallback';
  confidence: number;
  provider?: string;
  details?: Record<string, unknown>;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}

/**
 * Content negotiation support
 */
export type ContentType = 'application/json' | 'application/cbor';
export type ProfileUri = string;

export interface ContentNegotiation {
  contentType: ContentType;
  profile?: ProfileUri;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}