/* istanbul ignore file */
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { problemDetails } from './problems';
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
  app.use(express.json({ limit: '1mb' }));

  /**
   * JSON parse errors must be mapped to RFC7807 validation errors (400)
   * Jest expects "validation_error" for malformed JSON bodies.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Express throws SyntaxError on invalid JSON (from express.json)
    if (err instanceof SyntaxError) {
      return res.status(400).type('application/problem+json').json({
        type: 'https://peacprotocol.org/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    }
    return _next(err as Error);
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

  // Global error handler - must be last
  app.use(problemErrorHandler);

  return app;
}

/**
 * Global Problem+JSON error handler.
 * Ensures validation/protocol errors surface with correct status instead of generic 500.
 * Keep as the LAST middleware.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function problemErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // Touch unused params to satisfy TS noUnusedParameters without changing behavior.
  void req;
  void _next;
  if (res.headersSent) return; // let Express default handler print

  // Known protocol header problems → 426
  if (err?.code === 'protocol_error' || /X-PEAC-Protocol/i.test(err?.message || '')) {
    return problemDetails.send(res, 'protocol_error', {
      detail: err?.message || 'Protocol version required or invalid',
    });
  }
  // Agreement reference problems (payments) → 422
  if (
    err?.code === 'invalid_reference' ||
    /agreement.*(missing|unknown|invalid)/i.test(err?.message || '')
  ) {
    return problemDetails.send(res, 'invalid_reference', {
      detail: err?.message || 'Invalid agreement reference',
    });
  }
  // Not found semantics
  if (err?.code === 'not_found' || /not found/i.test(err?.message || '')) {
    return problemDetails.send(res, 'not_found', {
      detail: err?.message || 'Resource not found',
    });
  }
  // Fingerprint/ETag conflicts → 409
  if (err?.code === 'fingerprint_mismatch' || /fingerprint/i.test(err?.message || '')) {
    return problemDetails.send(res, 'fingerprint_mismatch', {
      detail: err?.message || 'Fingerprint mismatch',
    });
  }
  // Validation issues (fallback)
  if (err?.code === 'validation_error') {
    return problemDetails.send(res, 'validation_error', {
      detail: err?.message || 'Validation error',
    });
  }

  const status =
    typeof err?.status === 'number'
      ? err.status
      : typeof err?.statusCode === 'number'
        ? err.statusCode
        : 500;
  // Best-effort code mapping; use explicit code if present
  const explicit = typeof err?.code === 'string' ? err.code : undefined;
  const code =
    explicit ??
    (status === 422
      ? 'validation_error'
      : status === 409
        ? 'conflict'
        : status === 404
          ? 'not_found'
          : status === 426
            ? 'upgrade_required'
            : 'internal_error');

  problemDetails.send(res, code as any, {
    status,
    detail: err?.message || 'Unexpected error',
  });
}
