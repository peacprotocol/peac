/**
 * PEAC Receipt v0.9.14 format - aligned with @peac/core types
 */
export interface Receipt {
  // Core metadata
  version: string; // v0.9.14
  protocol_version: string; // v0.9.14
  wire_version: string; // v0.9

  // Subject/resource
  subject: {
    uri: string;
  };
  sub?: string; // computed URN

  // AI preferences
  aipref: {
    status: 'allowed' | 'denied' | 'restricted' | 'unknown';
  };

  // Core purpose
  purpose: 'train-ai' | 'inference' | 'content-creation' | 'analysis' | 'other';

  // Enforcement
  enforcement: {
    method: 'none' | 'http-402';
  };

  // Payment (required if method is http-402)
  payment?: {
    scheme: string; // v0.9.14: renamed from 'rail'
    amount: number;
    currency: string;
  };

  // JOSE standard fields
  iat: number; // v0.9.14: Unix timestamp (replaces prior timestamp field)
  exp?: number;
  kid: string;
  nonce?: string;

  // Policy tracking
  policy_hash?: string;

  // Crawler classification
  crawler_type: 'bot' | 'agent' | 'hybrid' | 'browser' | 'migrating' | 'test' | 'unknown';
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
