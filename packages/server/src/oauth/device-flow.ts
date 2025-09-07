import { Router } from 'express';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import pino from 'pino';
import { JWKSManager } from '../security/jwks-manager';

const logger = pino({ name: 'device-flow' });

interface PendingFlow {
  client_id: string;
  scope: string;
  agent_info: {
    id: string;
    name: string;
    public_key_thumbprint?: string;
  };
  user_code: string;
  expires_at: number;
  interval: number;
  status: 'pending' | 'approved' | 'denied';
  user_id?: string;
  approved_entitlements?: Record<string, unknown>[];
}

export class DeviceFlowService {
  constructor(
    private redis: Redis,
    private jwksManager: JWKSManager,
    private config: {
      issuer: string;
      audience?: string;
      device_code_length?: number;
      user_code_length?: number;
      expiry_seconds?: number;
      poll_interval?: number;
    }
  ) {
    this.config = {
      device_code_length: 32,
      user_code_length: 8,
      expiry_seconds: 600,
      poll_interval: 5,
      ...config,
    };
  }

  async initiateFlow(params: {
    client_id: string;
    scope?: string;
    agent_info?: Record<string, unknown>;
  }): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  }> {
    const device_code = this.generateDeviceCode();
    const user_code = this.generateUserCode();

    logger.info(
      {
        client_id: params.client_id,
        user_code,
      },
      'Initiating device flow'
    );

    const flow: PendingFlow = {
      client_id: params.client_id,
      scope: params.scope || 'read',
      agent_info: (params.agent_info as {
        id: string;
        name: string;
        public_key_thumbprint?: string;
      }) || { id: params.client_id, name: params.client_id },
      user_code,
      expires_at: Date.now() + this.config.expiry_seconds! * 1000,
      interval: this.config.poll_interval!,
      status: 'pending',
    };

    await this.redis.setex(
      `device:${device_code}`,
      this.config.expiry_seconds!,
      JSON.stringify(flow)
    );

    await this.redis.setex(`user_code:${user_code}`, this.config.expiry_seconds!, device_code);

    return {
      device_code,
      user_code,
      verification_uri: `${this.config.issuer}/device`,
      verification_uri_complete: `${this.config.issuer}/device?code=${user_code}`,
      expires_in: this.config.expiry_seconds!,
      interval: this.config.poll_interval!,
    };
  }

  async approveFlow(
    user_code: string,
    user: { id: string },
    entitlements: Record<string, unknown>[]
  ): Promise<void> {
    const device_code = await this.redis.get(`user_code:${user_code}`);
    if (!device_code) {
      throw new Error('Invalid or expired user code');
    }

    const flowData = await this.redis.get(`device:${device_code}`);
    if (!flowData) {
      throw new Error('Flow not found');
    }

    const flow: PendingFlow = JSON.parse(flowData);

    if (flow.status !== 'pending') {
      throw new Error('Flow already processed');
    }

    flow.status = 'approved';
    flow.user_id = user.id;
    flow.approved_entitlements = entitlements;

    const ttl = Math.floor((flow.expires_at - Date.now()) / 1000);
    if (ttl > 0) {
      await this.redis.setex(`device:${device_code}`, ttl, JSON.stringify(flow));
    }

    logger.info(
      {
        user_code,
        user_id: user.id,
      },
      'Device flow approved'
    );
  }

  async pollToken(
    device_code: string
  ): Promise<
    | { access_token: string; token_type: 'DPoP'; expires_in: number }
    | { error: string; error_description?: string }
  > {
    const flowData = await this.redis.get(`device:${device_code}`);
    if (!flowData) {
      return {
        error: 'invalid_grant',
        error_description: 'Invalid or expired device code',
      };
    }

    const flow: PendingFlow = JSON.parse(flowData);

    if (Date.now() > flow.expires_at) {
      await this.redis.del(`device:${device_code}`);
      return {
        error: 'expired_token',
        error_description: 'Device code has expired',
      };
    }

    if (flow.status === 'pending') {
      return {
        error: 'authorization_pending',
        error_description: 'Authorization pending',
      };
    }

    if (flow.status === 'denied') {
      await this.redis.del(`device:${device_code}`);
      return {
        error: 'access_denied',
        error_description: 'User denied authorization',
      };
    }

    const now = Math.floor(Date.now() / 1000);

    const udaPayload = {
      iss: this.config.issuer,
      sub: flow.user_id!,
      aud: this.config.audience || this.config.issuer,
      exp: now + 300,
      iat: now,
      nbf: now - 60,
      jti: crypto.randomUUID(),

      peac_agent: flow.agent_info,
      peac_entitlements: flow.approved_entitlements,

      ...(flow.agent_info.public_key_thumbprint && {
        cnf: { jkt: flow.agent_info.public_key_thumbprint },
      }),
    };

    const token = await this.jwksManager.sign(udaPayload);

    await this.redis.del(`device:${device_code}`);
    await this.redis.del(`user_code:${flow.user_code}`);

    logger.info(
      {
        user_id: flow.user_id,
        client_id: flow.client_id,
      },
      'UDA token issued'
    );

    return {
      access_token: token,
      token_type: 'DPoP',
      expires_in: 300,
    };
  }

  private generateDeviceCode(): string {
    return crypto.randomBytes(this.config.device_code_length!).toString('base64url');
  }

  private generateUserCode(): string {
    const chars = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
    let code = '';

    for (let i = 0; i < this.config.user_code_length!; i++) {
      if (i === 4) code += '-';
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }
}

export function createDeviceFlowRouter(redis: Redis, jwksManager: JWKSManager): Router {
  const router = Router();
  const service = new DeviceFlowService(redis, jwksManager, {
    issuer: process.env.PEAC_ISSUER || 'https://demo.peac.dev',
    audience: process.env.PEAC_AUDIENCE || process.env.PEAC_ISSUER || 'https://demo.peac.dev',
  });

  router.post('/device_authorization', async (req, res, next) => {
    try {
      const result = await service.initiateFlow({
        client_id: req.body.client_id || 'unknown',
        scope: req.body.scope,
        agent_info: req.body.agent_info,
      });

      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/token', async (req, res, next) => {
    try {
      if (req.body.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code') {
        return res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only device_code grant type is supported',
        });
      }

      const result = await service.pollToken(req.body.device_code);

      res.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      });

      if ('error' in result) {
        const status = result.error === 'authorization_pending' ? 400 : 400;
        return res.status(status).json(result);
      } else {
        return res.json(result);
      }
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
