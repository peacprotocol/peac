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
    const checks: Record<string, boolean> = {};
    let allHealthy = true;

    try {
      checks.database = await config.database.ping();
    } catch (err) {
      logger.error({ err }, 'Database health check failed');
      checks.database = false;
      allHealthy = false;
    }

    try {
      await config.redis.ping();
      checks.redis = true;
    } catch (err) {
      logger.error({ err }, 'Redis health check failed');
      checks.redis = false;
      allHealthy = false;
    }

    try {
      const jwks = config.jwksManager.getJWKS();
      checks.jwks = jwks.keys.length > 0;
      if (!checks.jwks) allHealthy = false;
    } catch (err) {
      logger.error({ err }, 'JWKS health check failed');
      checks.jwks = false;
      allHealthy = false;
    }

    const status = allHealthy ? 200 : 503;

    res.status(status).json({
      status: allHealthy ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });

    if (!allHealthy) {
      logger.warn({ checks }, 'Readiness check failed');
    }
  });

  return router;
}
