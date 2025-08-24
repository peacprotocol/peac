import { Router } from 'express';
import { Redis } from 'ioredis';
import pino from 'pino';
import { JWKSManager } from '../security/jwks-manager';

const logger = pino({ name: 'health' });

interface HealthCheckConfig {
  database: {
    ping(): Promise<boolean>;
  };
  redis: Redis;
  jwksManager: JWKSManager;
  providers: Map<string, unknown>;
}

export function createHealthRouter(config: HealthCheckConfig): Router {
  const router = Router();

  router.get('/health/liveness', async (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.9.8',
    });
  });

  router.get('/health/readiness', async (_req, res) => {
    const checks = {
      redis: false,
      database: false,
      jwks: false,
    };

    try {
      await config.redis.ping();
      checks.redis = true;
    } catch (error) {
      logger.error({ error }, 'Redis health check failed');
    }

    try {
      await config.database.ping();
      checks.database = true;
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
    }

    try {
      const { jwks } = await config.jwksManager.getPublicJWKS();
      checks.jwks = jwks.keys.length > 0;
    } catch (error) {
      logger.error({ error }, 'JWKS health check failed');
    }

    const allHealthy = Object.values(checks).every(Boolean);
    const status = allHealthy ? 'ok' : 'degraded';

    res.status(allHealthy ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      checks,
      version: '0.9.8',
    });
  });

  return router;
}
