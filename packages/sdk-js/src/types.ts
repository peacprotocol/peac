/**
 * @peac/sdk/types - Client SDK types for PEAC operations
 */

/** Map of key ID to public key (Uint8Array or base64url-encoded string) */
export type PublicKeyMap = Record<string, Uint8Array | string>;

export interface ClientConfig {
  defaultKeys?: PublicKeyMap;
  timeout?: number;
  userAgent?: string;
  retries?: number;
  inject?: {
    core?: { verifyReceipt: (receipt: string, keys: PublicKeyMap) => Promise<unknown> };
    disc?: { discover: (origin: string) => Promise<unknown> };
    pref?: { resolveAIPref: (uri: string) => Promise<unknown> };
  };
}

export interface DiscoverOptions {
  timeout?: number;
  validateSchema?: boolean;
}

export interface VerifyLocalOptions {
  keys?: PublicKeyMap;
  validateReceipt?: boolean;
  validateAIPref?: boolean;
}

export interface VerifyRemoteOptions {
  endpoint?: string;
  timeout?: number;
  keys?: PublicKeyMap;
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
