export interface Adapter {
  name(): string;
  discoveryFragment(): Record<string, unknown>;
  initialize?(config: Record<string, string>): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface UDAAdapter extends Adapter {
  verify(
    token: string,
    expectedAudience: string,
    agentKey?: import('jose').KeyLike,
  ): Promise<UDAVerificationResult>;
}

export interface AttestationAdapter extends Adapter {
  verify(token: string, expectedAudience: string): Promise<AttestationVerificationResult>;
}

export interface UDAVerificationResult {
  valid: boolean;
  user_id?: string;
  agent?: {
    id: string;
    name: string;
    attestation_jti?: string;
  };
  entitlements?: Array<{
    type: 'ownership' | 'subscription' | 'rental' | 'library';
    resource: string;
    scopes: string[];
    expires?: string;
  }>;
  constraints?: {
    rate_limit?: string;
    geo_restriction?: string[];
    device_limit?: number;
  };
  resource?: string;
  key_thumbprint?: string;
  expires_at?: Date;
  error?: string;
}

export interface AttestationVerificationResult {
  valid: boolean;
  agent_id?: string;
  vendor?: string;
  trusted?: boolean;
  rate_limit_multiplier?: number;
  runtime_type?: string;
  public_key_thumbprint?: string;
  expires_at?: Date;
  error?: string;
}
