export interface Policy {
  version: string;
  site: {
    name: string;
    domain: string;
    contact?: string;
  };
  attribution?: {
    format?: string;
    required?: boolean;
  };
  privacy?: {
    retention_days?: number;
  };
  logging?: {
    sink?: string;
  };
  exports?: {
    enabled?: boolean;
    auth?: 'signature' | 'token';
    max_rows?: number;
  };
  heavy_paths?: string[];
  rate_limits?: {
    anonymous?: number;
    attributed?: number;
    verified?: number;
  };
  receipts?: {
    mode?: 'disabled' | 'optional' | 'required';
    hosted?: boolean;
  };
  identity?: {
    web_bot_auth?: {
      accepted?: boolean;
    };
  };
}

export interface PolicyCacheEntry {
  policy: Policy;
  etag?: string;
  lastModified?: string;
  cachedAt: number;
  expiresAt: number;
  integrity?: string;
}

export interface IdentityHint {
  kind: 'web-bot-auth' | 'mcp' | 'a2a' | 'nanda';
  signatureAgentURL?: string;
  signer?: Signer;
  session?: string;
  proof?: Uint8Array;
  ticket?: string;
}

export interface Signer {
  sign(data: Uint8Array): Promise<Uint8Array>;
  getPublicKey(): Promise<Uint8Array>;
}

export interface ReceiptResult {
  ok: boolean;
  jws?: string;
  ref?: string;
  claims?: any;
  error?: string;
}

export interface RateLimitHint {
  limit?: number;
  remaining?: number;
  reset?: number;
}

export interface KeyStore {
  [kid: string]: JsonWebKey;
}

export interface KeyResolver {
  (kid: string): Promise<JsonWebKey | undefined>;
}

export interface JsonWebKey {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  use?: string;
  key_ops?: string[];
  alg?: string;
  kid?: string;
}