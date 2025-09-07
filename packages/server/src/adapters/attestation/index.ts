import * as jose from 'jose';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PEACError } from '../../errors/problem-json';
import { AttestationAdapter, AttestationVerificationResult } from '../spi';

const logger = pino({ name: 'attestation-adapter' });

export enum AttestationProblemType {
  ATTESTATION_REQUIRED = 'peac_attestation_required',
  ATTESTATION_INVALID = 'peac_attestation_invalid',
  ATTESTATION_REVOKED = 'peac_attestation_revoked',
  ATTESTATION_EXPIRED = 'peac_attestation_expired',
  ATTESTATION_AUDIENCE_MISMATCH = 'peac_attestation_audience_mismatch',
}

interface AgentAttestation {
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;

  peac_agent_vendor: string;
  peac_agent_name: string;
  peac_agent_version: string;
  peac_agent_build?: string;

  peac_runtime_type: 'browser' | 'headless' | 'native' | 'extension';
  peac_runtime_platform: string;

  peac_public_key?: jose.JWK;

  peac_transparency_log?: string;
  peac_revocation_check?: string;
}

interface VendorConfig {
  jwks_uri?: string;
  self_signed?: boolean;
  trusted: boolean;
  rate_limit_multiplier: number;
}

export class AttestationAdapterImpl implements AttestationAdapter {
  private vendorConfigs = new Map<string, VendorConfig>();
  private jwksCache = new Map<string, { jwks: jose.JSONWebKeySet; fetched: number }>();
  private verificationCache = new Map<
    string,
    { result: AttestationVerificationResult; expires: number }
  >();

  constructor(config: { redis: Redis; vendors?: Record<string, VendorConfig> }) {
    this.registerVendor('Anthropic', {
      jwks_uri: 'https://anthropic.com/.well-known/agent-keys.json',
      trusted: true,
      rate_limit_multiplier: 10,
    });

    this.registerVendor('OpenAI', {
      jwks_uri: 'https://api.openai.com/.well-known/agent-keys.json',
      trusted: true,
      rate_limit_multiplier: 10,
    });

    this.registerVendor('Perplexity', {
      jwks_uri: 'https://perplexity.ai/.well-known/agent-keys.json',
      trusted: true,
      rate_limit_multiplier: 8,
    });

    this.registerVendor('*', {
      self_signed: true,
      trusted: false,
      rate_limit_multiplier: 1,
    });

    if (config.vendors) {
      Object.entries(config.vendors).forEach(([name, cfg]) => {
        this.registerVendor(name, cfg);
      });
    }
  }

  name(): string {
    return 'attestation';
  }

  discoveryFragment(): Record<string, unknown> {
    const trustedVendors = Array.from(this.vendorConfigs.entries())
      .filter(([name, cfg]) => cfg.trusted && name !== '*')
      .map(([name]) => name);

    return {
      endpoints: {
        attestation: {
          href: '/adapters/attestation/verify',
          methods: ['POST'],
        },
      },
      auth_hints: {
        agent_attestation: {
          required: false,
          version: 'peac/legit-agent-v1',
          trusted_vendors: trustedVendors,
          self_signed_allowed: this.vendorConfigs.has('*'),
        },
      },
      agent_policy: {
        verified_agents_only: false,
        rate_limits: {
          unverified: '10/hour',
          verified: '100/hour',
          trusted: '1000/hour',
        },
        human_pacing_required: true,
        ban_on_violation: false,
      },
    };
  }

  async verify(token: string, expectedAudience: string): Promise<AttestationVerificationResult> {
    try {
      const cacheKey = `${token}:${expectedAudience}`;
      const cached = this.verificationCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.result;
      }

      const decoded = jose.decodeJwt(token) as AgentAttestation;

      logger.info(
        {
          vendor: decoded.peac_agent_vendor,
          agent: decoded.peac_agent_name,
          version: decoded.peac_agent_version,
        },
        'Verifying agent attestation'
      );

      const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
      if (!audiences.includes(expectedAudience)) {
        logger.warn(
          {
            expected: expectedAudience,
            actual: decoded.aud,
          },
          'Audience mismatch'
        );

        throw new PEACError(
          AttestationProblemType.ATTESTATION_AUDIENCE_MISMATCH,
          `Audience mismatch: expected ${expectedAudience}`,
          403
        );
      }

      const now = Math.floor(Date.now() / 1000);

      if (decoded.exp < now) {
        throw new PEACError(
          AttestationProblemType.ATTESTATION_EXPIRED,
          'Attestation has expired',
          403
        );
      }

      if (decoded.exp - decoded.iat > 3600) {
        throw new Error('Attestation TTL exceeds 1 hour');
      }

      const vendor = decoded.peac_agent_vendor;
      const vendorConfig = this.vendorConfigs.get(vendor) || this.vendorConfigs.get('*');

      if (!vendorConfig) {
        throw new Error(`No configuration for vendor: ${vendor}`);
      }

      let verified: jose.JWTVerifyResult;

      if (vendorConfig.jwks_uri) {
        const jwks = await this.fetchJWKS(vendorConfig.jwks_uri);
        verified = await jose.jwtVerify(token, jwks, {
          audience: expectedAudience,
        });
      } else if (vendorConfig.self_signed && decoded.peac_public_key) {
        const publicKey = await jose.importJWK(decoded.peac_public_key);
        verified = await jose.jwtVerify(token, publicKey, {
          audience: expectedAudience,
        });
      } else {
        throw new Error('No verification method available');
      }

      const attestation = verified.payload as unknown as AgentAttestation;

      if (attestation.peac_revocation_check) {
        const revoked = await this.checkRevocation(
          attestation.peac_revocation_check,
          attestation.jti
        );
        if (revoked) {
          throw new PEACError(
            AttestationProblemType.ATTESTATION_REVOKED,
            'Attestation has been revoked',
            403
          );
        }
      }

      let publicKeyThumbprint: string | undefined;
      if (attestation.peac_public_key) {
        publicKeyThumbprint = await jose.calculateJwkThumbprint(
          attestation.peac_public_key,
          'sha256'
        );
      }

      const result: AttestationVerificationResult = {
        valid: true,
        agent_id: `${attestation.peac_agent_vendor}/${attestation.peac_agent_name}/${attestation.peac_agent_version}`,
        vendor: attestation.peac_agent_vendor,
        trusted: vendorConfig.trusted,
        rate_limit_multiplier: vendorConfig.rate_limit_multiplier,
        runtime_type: attestation.peac_runtime_type,
        public_key_thumbprint: publicKeyThumbprint,
        expires_at: new Date(attestation.exp * 1000),
      };

      const cacheTTL = Math.min(3600000, attestation.exp * 1000 - Date.now());

      this.verificationCache.set(cacheKey, {
        result,
        expires: Date.now() + cacheTTL,
      });

      logger.info(
        {
          agent_id: result.agent_id,
          trusted: result.trusted,
        },
        'Attestation verification successful'
      );

      return result;
    } catch (error) {
      if (error instanceof PEACError) {
        throw error;
      }

      logger.error({ err: error }, 'Attestation verification failed');

      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  private registerVendor(name: string, config: VendorConfig): void {
    this.vendorConfigs.set(name, config);
    if (name !== '*') {
      logger.info({ vendor: name }, 'Registered vendor');
    }
  }

  private async fetchJWKS(uri: string): Promise<jose.JWTVerifyGetKey> {
    const cached = this.jwksCache.get(uri);
    if (cached && Date.now() - cached.fetched < 300000) {
      return jose.createLocalJWKSet(cached.jwks);
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.statusText}`);
    }

    const jwks = await response.json();

    this.jwksCache.set(uri, {
      jwks,
      fetched: Date.now(),
    });

    return jose.createLocalJWKSet(jwks);
  }

  private async checkRevocation(url: string, jti: string): Promise<boolean> {
    try {
      const response = await fetch(`${url}?jti=${encodeURIComponent(jti)}`);
      if (!response.ok) {
        logger.warn({ url, status: response.status }, 'Revocation check failed');
        return false;
      }

      const result = await response.json();
      return result.revoked === true;
    } catch (err) {
      logger.error({ err, url }, 'Revocation check error');
      return false;
    }
  }
}
