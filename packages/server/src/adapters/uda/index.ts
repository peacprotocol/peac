import * as jose from 'jose';
import { Redis } from 'ioredis';
import pino from 'pino';
import { PEACError } from '../../errors/problem-json';
import { udaReplaysBlocked } from '../../metrics/prometheus';
import { UDAAdapter, UDAVerificationResult } from '../spi';

const logger = pino({ name: 'uda-adapter' });

export enum UDAProblemType {
  UDA_MISSING = 'peac_uda_missing',
  UDA_INVALID = 'peac_uda_invalid',
  UDA_UNTRUSTED_ISSUER = 'peac_uda_untrusted_issuer',
  UDA_REPLAY = 'peac_uda_replay',
  UDA_INSUFFICIENT_ENTITLEMENT = 'peac_uda_insufficient_entitlement',
  UDA_KEY_BINDING_FAILED = 'peac_uda_key_binding_failed',
}

interface UDAProof {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;
  nbf?: number;

  peac_agent?: {
    id: string;
    name: string;
    attestation_jti?: string;
  };

  peac_entitlements?: Array<{
    type: 'ownership' | 'subscription' | 'rental' | 'library';
    resource: string;
    scopes: string[];
    expires?: string;
  }>;

  peac_resource?: string;

  peac_constraints?: {
    rate_limit?: string;
    geo_restriction?: string[];
    device_limit?: number;
  };

  cnf?: {
    jkt: string;
  };
}

interface TrustedIssuer {
  iss: string;
  jwks_uri: string;
  name: string;
  enabled: boolean;
}

export class UDAAdapterImpl implements UDAAdapter {
  private redis: Redis;
  private trustedIssuers = new Map<string, TrustedIssuer>();
  private jwksCache = new Map<string, { jwks: jose.JSONWebKeySet; fetched: number }>();

  constructor(config: { redis: Redis; trustedIssuers?: TrustedIssuer[] }) {
    this.redis = config.redis;

    this.registerIssuer({
      iss: 'https://demo.peac.dev/auth',
      jwks_uri: 'https://demo.peac.dev/.well-known/jwks.json',
      name: 'PEAC Demo Store',
      enabled: true,
    });

    if (config.trustedIssuers) {
      config.trustedIssuers.forEach((issuer) => this.registerIssuer(issuer));
    }
  }

  name(): string {
    return 'uda';
  }

  discoveryFragment(): Record<string, unknown> {
    const enabledIssuers = Array.from(this.trustedIssuers.values())
      .filter((i) => i.enabled)
      .map((i) => i.iss);

    return {
      endpoints: {
        uda: {
          href: '/adapters/uda/verify',
          methods: ['POST'],
        },
      },
      auth_hints: {
        user_delegated_access: {
          supported: true,
          oauth_device_flow: true,
          issuers: enabledIssuers,
          scopes: ['read', 'summarize', 'translate', 'annotate'],
        },
      },
    };
  }

  async verify(
    token: string,
    expectedAudience: string,
    agentKey?: jose.KeyLike,
  ): Promise<UDAVerificationResult> {
    try {
      const claims = jose.decodeJwt(token) as UDAProof;

      logger.info(
        {
          iss: claims.iss,
          sub: claims.sub,
          jti: claims.jti,
        },
        'Verifying UDA token',
      );

      const issuer = this.trustedIssuers.get(claims.iss);
      if (!issuer || !issuer.enabled) {
        logger.warn({ iss: claims.iss }, 'Untrusted issuer');
        throw new PEACError(
          UDAProblemType.UDA_UNTRUSTED_ISSUER,
          `Issuer ${claims.iss} is not in the trusted list`,
          403,
        );
      }

      const jwks = await this.fetchJWKS(issuer.jwks_uri);

      const { payload } = await jose.jwtVerify(token, jwks, {
        audience: expectedAudience,
        clockTolerance: 60,
      });

      const proof = payload as unknown as UDAProof;

      const now = Math.floor(Date.now() / 1000);

      if (proof.nbf && proof.nbf > now + 60) {
        throw new Error('Token not yet valid');
      }

      if (proof.exp - proof.iat > 300) {
        throw new Error('Token TTL exceeds 5 minutes');
      }

      const replayKey = `uda:jti:${proof.jti}`;
      const ttl = Math.max(60, Math.min(900, proof.exp - now + 60));

      const isNew = await this.redis.set(replayKey, '1', 'EX', ttl, 'NX');

      if (!isNew) {
        logger.warn({ jti: proof.jti }, 'UDA replay detected');
        udaReplaysBlocked.inc();
        throw new PEACError(UDAProblemType.UDA_REPLAY, 'This UDA token has already been used', 403);
      }

      let keyThumbprint: string | undefined;

      if (agentKey && proof.cnf?.jkt) {
        const jwk = await jose.exportJWK(agentKey);
        const thumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');

        if (thumbprint !== proof.cnf.jkt) {
          logger.warn(
            {
              expected: proof.cnf.jkt,
              actual: thumbprint,
            },
            'Key binding mismatch',
          );

          throw new PEACError(
            UDAProblemType.UDA_KEY_BINDING_FAILED,
            'Agent key does not match UDA key binding',
            403,
          );
        }

        keyThumbprint = thumbprint;
      }

      logger.info(
        {
          sub: proof.sub,
          agent: proof.peac_agent?.id,
        },
        'UDA verification successful',
      );

      return {
        valid: true,
        user_id: proof.sub,
        agent: proof.peac_agent,
        entitlements: proof.peac_entitlements,
        constraints: proof.peac_constraints,
        resource: proof.peac_resource,
        key_thumbprint: keyThumbprint,
        expires_at: new Date(proof.exp * 1000),
      };
    } catch (error) {
      if (error instanceof PEACError) {
        throw error;
      }

      logger.error({ err: error }, 'UDA verification failed');

      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  private registerIssuer(issuer: TrustedIssuer): void {
    this.trustedIssuers.set(issuer.iss, issuer);
    logger.info({ issuer: issuer.iss }, 'Registered trusted issuer');
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
}
