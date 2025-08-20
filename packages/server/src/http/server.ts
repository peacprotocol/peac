/* istanbul ignore file */
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getRedis } from '../utils/redis-pool';
import { getMetricsRegistry } from '../metrics';
import { createRoutes } from './routes';
import { config } from '../config';

export async function createServer() {
  const app = express();

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Set trust proxy for accurate IP detection
  app.set('trust proxy', true);

  app.use(helmet());

  // Remove X-XSS-Protection header completely (deprecated and potentially harmful)
  app.use((_req, res, next) => {
    res.removeHeader('X-XSS-Protection');
    next();
  });
  app.use(cors({ origin: config.gates.corsOrigins }));

  // Raw body middleware for webhook verification  
  app.use(
    '/webhooks/peac',
    express.raw({ type: ['application/json', 'application/*+json'], limit: '1mb' }),
    (req, _res, next) => {
      // Store the raw buffer as string for signature verification
      (req as Request & { rawBody?: string }).rawBody = req.body.toString('utf8');
      try {
        // Parse JSON for route handlers but keep rawBody for verification
        req.body = JSON.parse((req as Request & { rawBody?: string }).rawBody || '');
      } catch {
        // Invalid JSON will be handled by validation middleware  
      }
      next();
    },
  );

  app.use(express.json({ limit: '1mb' }));
  
  // JSON parsing error handler - must be after express.json()
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err && (err as unknown as { type: string }).type === 'entity.parse.failed') {
      res.setHeader('Content-Type', 'application/problem+json');
      return res.status(400).json({
        type: 'https://peacprotocol.org/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid JSON in request body'
      });
    }
    return next(err);
  });

  if (config.gates.healthEnabled) {
    app.get('/healthz', async (_req, res) => {
      const health: {
        status: 'ok' | 'degraded';
        version: string;
        components: Record<string, string>;
      } = { status: 'ok', version: '0.9.6', components: {} };
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
