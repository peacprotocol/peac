/**
 * @peac/sdk/types - Client SDK types for PEAC operations
 */

export interface ClientConfig {
  defaultKeys?: Record<string, any>;
  timeout?: number;
  userAgent?: string;
  retries?: number;
}

export interface DiscoverOptions {
  timeout?: number;
  validateSchema?: boolean;
}

export interface VerifyLocalOptions {
  keys?: Record<string, any>;
  validateReceipt?: boolean;
  validateAIPref?: boolean;
}

export interface VerifyRemoteOptions {
  endpoint?: string;
  timeout?: number;
  keys?: Record<string, any>;
}

export interface DiscoveryResult {
  origin: string;
  valid: boolean;
  discovery?: {
    preferences?: string;
    access_control?: string;
    payments?: string[];
    provenance?: string;
    receipts?: 'required' | 'optional';
    verify?: string;
    public_keys?: Array<{
      kid: string;
      alg: string;
      key: string;
    }>;
  };
  errors?: string[];
  cached?: boolean;
}

export interface VerificationResult {
  valid: boolean;
  receipt?: {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
  verification?: {
    signature: 'valid' | 'invalid';
    schema: 'valid' | 'invalid';
    aipref?: 'valid' | 'invalid' | 'not_checked';
    timestamp: string;
    key_id?: string;
  };
  errors?: string[];
  remote?: boolean;
}

export interface ClientError extends Error {
  code: string;
  statusCode?: number;
  details?: string[];
}