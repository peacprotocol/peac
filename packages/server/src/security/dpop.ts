import * as jose from 'jose';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import { PEACError } from '../errors/problem-json';
import { dpopReplaysBlocked } from '../metrics/prometheus';
import { WIRE_VERSION } from '@peacprotocol/schema';

const logger = pino({ name: 'dpop' });

export enum DPoPProblemType {
  DPOP_MISSING = 'peac_dpop_missing',
  DPOP_INVALID = 'peac_dpop_invalid',
  DPOP_REPLAY = 'peac_dpop_replay',
  DPOP_BINDING_MISMATCH = 'peac_dpop_binding_mismatch',
}

interface DPoPProof {
  htm: string;
  htu: string;
  iat: number;
  jti: string;
  ath?: string;
}

export function canonicalHtu(req: {
  headers: Record<string, string | string[] | undefined>;
  protocol: string;
  get(name: string): string | undefined;
  originalUrl: string;
}): string {
  const proto =
    (Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : req.headers['x-forwarded-proto']) || req.protocol;
  const host =
    (Array.isArray(req.headers['x-forwarded-host'])
      ? req.headers['x-forwarded-host'][0]
      : req.headers['x-forwarded-host']) ||
    req.get('host') ||
    'localhost';
  const url = new URL(`${proto}://${host}${req.originalUrl}`);

  if ((proto === 'http' && url.port === '80') || (proto === 'https' && url.port === '443')) {
    url.port = '';
  }

  url.hash = '';

  return url.toString();
}

async function calculateAth(accessToken: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(accessToken).digest();
  return jose.base64url.encode(hash);
}

export class DPoPVerifier {
  constructor(private redis: Redis) {}

  async verify(
    dpopHeader: string,
    method: string,
    url: string,
    accessToken?: string,
    udaKeyThumbprint?: string,
  ): Promise<{ valid: boolean; jwk?: jose.JWK; error?: string }> {
    try {
      const header = jose.decodeProtectedHeader(dpopHeader);

      if (header.typ !== 'dpop+jwt') {
        throw new Error('Invalid DPoP type');
      }

      if (!header.jwk) {
        throw new Error('Missing JWK in DPoP header');
      }

      const jwk = header.jwk as jose.JWK;
      const publicKey = await jose.importJWK(jwk);

      const { payload: verifiedPayload } = await jose.jwtVerify(dpopHeader, publicKey, {
        algorithms: ['ES256', 'RS256'],
      });

      const proof = verifiedPayload as unknown as DPoPProof;

      if (proof.htm !== method) {
        throw new Error(`Method mismatch: expected ${method}, got ${proof.htm}`);
      }

      if (proof.htu !== url) {
        throw new Error(`URL mismatch: expected ${url}, got ${proof.htu}`);
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - proof.iat) > 60) {
        throw new Error('DPoP proof expired');
      }

      if (accessToken && proof.ath) {
        const expectedAth = await calculateAth(accessToken);
        if (proof.ath !== expectedAth) {
          throw new Error('Access token hash mismatch');
        }
      }

      const replayKey = `dpop:jti:${proof.jti}`;
      const ttl = 300;

      const isNew = await this.redis.set(replayKey, '1', 'EX', ttl, 'NX');

      if (!isNew) {
        logger.warn({ jti: proof.jti }, 'DPoP replay detected');
        dpopReplaysBlocked.inc();
        throw new PEACError(DPoPProblemType.DPOP_REPLAY, 'DPoP proof has already been used', 403);
      }

      if (udaKeyThumbprint) {
        const dpopThumbprint = await jose.calculateJwkThumbprint(jwk, 'sha256');
        if (dpopThumbprint !== udaKeyThumbprint) {
          logger.warn(
            {
              expected: udaKeyThumbprint,
              actual: dpopThumbprint,
            },
            'DPoP key binding mismatch',
          );

          throw new PEACError(
            DPoPProblemType.DPOP_BINDING_MISMATCH,
            'DPoP key does not match UDA key binding',
            403,
          );
        }
      }

      logger.debug({ jti: proof.jti }, 'DPoP verification successful');

      return { valid: true, jwk };
    } catch (error) {
      if (error instanceof PEACError) {
        throw error;
      }

      logger.error({ err: error }, 'DPoP verification failed');

      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }
}

export function requireDPoP(redis: Redis) {
  const verifier = new DPoPVerifier(redis);

  return async (req: Request, res: Response, next: NextFunction) => {
    const dpopHeader = req.headers['dpop'];

    if (!dpopHeader) {
      return next(
        new PEACError(DPoPProblemType.DPOP_MISSING, 'DPoP proof required for this endpoint', 401),
      );
    }

    try {
      const url = canonicalHtu(req);

      let accessToken: string | undefined;
      const authHeader = req.headers['authorization'];
      const authHeaderString = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (authHeaderString && authHeaderString.startsWith('DPoP ')) {
        accessToken = authHeaderString.substring(5);
      }

      const udaKeyThumbprint = req.uda?.key_thumbprint;

      const dpopHeaderString = Array.isArray(dpopHeader) ? dpopHeader[0] : dpopHeader;

      const result = await verifier.verify(
        dpopHeaderString,
        req.method,
        url,
        accessToken,
        udaKeyThumbprint,
      );

      if (!result.valid) {
        throw new PEACError(
          DPoPProblemType.DPOP_INVALID,
          result.error || 'Invalid DPoP proof',
          403,
        );
      }

      req.dpop = {
        jwk: result.jwk,
        verified: true,
      };

      res.set('X-PEAC-Protocol', req.protocolVersion || WIRE_VERSION);

      next();
    } catch (error) {
      next(error);
    }
  };
}
