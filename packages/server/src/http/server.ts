/* istanbul ignore file */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getRedis } from '../utils/redis-pool';
import { getMetricsRegistry } from '../metrics';
import { createRoutes } from './routes';
import { config } from '../config';

export async function createServer() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.gates.corsOrigins }));
  app.use(express.json());

  if (config.gates.healthEnabled) {
    app.get('/healthz', async (_req, res) => {
      const health: { status: 'ok' | 'degraded'; version: string; components: Record<string, string> } = { status: 'ok', version: '0.9.3', components: {} };
      try {
        const redis = getRedis();
        await redis.ping();
        health.components.redis = 'up';
      } catch {
        health.components.redis = 'down';
        health.status = 'degraded';
      }
      res.status(health.status === 'ok' ? 200 : 503).json(health);
    });
  }

  app.get('/metrics', async (_req, res) => {
    if (!config.gates.metricsEnabled) return void res.status(404).end();
    const reg = getMetricsRegistry();
    res.setHeader('Content-Type', reg.contentType);
    res.send(await reg.metrics());
  });

  app.use('/', createRoutes());
  return app;
}
