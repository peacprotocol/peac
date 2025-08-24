import { Router } from 'express';
import pino from 'pino';
import { JWKSManager } from '../security/jwks-manager';

const logger = pino({ name: 'health' });

interface HealthDependencies {
  database: { ping: () => Promise<void> };
  redis: { ping: () => Promise<void> };
  jwksManager: JWKSManager;
  providers: Map<string, { healthCheck?: () => Promise<boolean> }>;
}

export function createHealthRouter(deps: HealthDependencies): Router {
  const router = Router();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.get('/health/live', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'peac-protocol',
      version: process.env.npm_package_version || '0.9.7.1',
      timestamp: new Date().toISOString(),
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.get('/health/ready', async (_req: any, res: any) => {
    const checks: Record<string, boolean> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details: Record<string, any> = {};
    const startTime = Date.now();

    // Check database
    try {
      const dbStart = Date.now();
      await deps.database.ping();
      checks.database = true;
      details.database = {
        status: 'connected',
        latency_ms: Date.now() - dbStart,
      };
    } catch (err: unknown) {
      checks.database = false;
      details.database = {
        status: 'disconnected',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      logger.error({ err }, 'Database health check failed');
    }

    // Check Redis with latency
    try {
      const redisStart = Date.now();
      await deps.redis.ping();
      checks.redis = true;
      details.redis = {
        status: 'connected',
        latency_ms: Date.now() - redisStart,
      };
    } catch (err: unknown) {
      checks.redis = false;
      details.redis = {
        status: 'disconnected',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      logger.error({ err }, 'Redis health check failed');
    }

    // Check JWKS with rotation info
    try {
      const { jwks } = await deps.jwksManager.getPublicJWKS();
      checks.jwks = jwks.keys.length > 0;

      // Get oldest key timestamp for rotation tracking
      let oldestKey = Date.now();
      for (const key of jwks.keys) {
        if (key.kid) {
          const timestamp = parseInt(key.kid.split('-').pop() || '0');
          if (timestamp && timestamp < oldestKey) {
            oldestKey = timestamp;
          }
        }
      }

      details.jwks = {
        status: checks.jwks ? 'ready' : 'no_keys',
        keyCount: jwks.keys.length,
        oldest_key_age_days: Math.floor((Date.now() - oldestKey) / (24 * 60 * 60 * 1000)),
      };
    } catch (err: unknown) {
      checks.jwks = false;
      details.jwks = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
      logger.error({ err }, 'JWKS health check failed');
    }

    // Check providers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerStatuses: Record<string, any> = {};
    for (const [name, provider] of deps.providers) {
      try {
        const healthy = (await provider.healthCheck?.()) ?? true;
        providerStatuses[name] = { status: healthy ? 'ready' : 'unhealthy' };
      } catch (err: unknown) {
        providerStatuses[name] = {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
    checks.providers = Object.values(providerStatuses).every((p) => p.status === 'ready');
    details.providers = providerStatuses;

    const ready = Object.values(checks).every((v) => v);

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      details,
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - startTime,
    });
  });

  return router;
}
