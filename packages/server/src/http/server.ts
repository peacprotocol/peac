/* istanbul ignore file */
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import fetch from 'cross-fetch';
import { problemDetails } from './problems';
import { getRedis } from '../utils/redis-pool';
import { getMetricsRegistry } from '../metrics';
import { createRoutes } from './routes';
import { config } from '../config';
import { JWKSManager } from '../security/jwks-manager';
import { AdapterRegistry } from '../adapters/registry';
import { UDAAdapterImpl } from '../adapters/uda';
import { AttestationAdapterImpl } from '../adapters/attestation';
import { createDeviceFlowRouter } from '../oauth/device-flow';
import { createDiscoveryRouter } from '../discovery/v1';
import { versionNegotiationMiddleware } from '../middleware/headers';
import { PEACError } from '../errors/problem-json';
import { requestTracing } from './middleware/request-tracing';
import { tieredRateLimiter } from '../middleware/tiered-rate-limit';
import { WIRE_VERSION } from '@peacprotocol/schema';

// Ensure global fetch is available
if (!(globalThis as any).fetch) {
  (globalThis as any).fetch = fetch;
}

export async function createServer() {
  const app = express();

  // Initialize v0.9.8 components
  const redis = getRedis();
  const jwksManager = new JWKSManager({
    keyStorePath: process.env.JWKS_PATH || './keys',
    rotationIntervalDays: 30,
    preferredAlgorithm: 'ES256',
    retireGracePeriodDays: 7,
  });
  await jwksManager.initialize();

  const adapterRegistry = new AdapterRegistry();
  await adapterRegistry.register(new UDAAdapterImpl({ redis }));
  await adapterRegistry.register(new AttestationAdapterImpl({ redis }));

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Set trust proxy for accurate IP detection
  app.set('trust proxy', true);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          childSrc: ["'none'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
    }),
  );

  // Add request tracing middleware
  app.use(requestTracing.middleware());

  // Add tiered rate limiting middleware with RFC 9331 headers
  app.use(tieredRateLimiter.middleware());

  // Remove X-XSS-Protection header completely (deprecated and potentially harmful)
  app.use((_req, res, next) => {
    res.removeHeader('X-XSS-Protection');
    next();
  });
  app.use(cors({ origin: config.gates.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  // v0.9.8 Version negotiation middleware
  app.use(versionNegotiationMiddleware);

  /**
   * JSON parse errors must be mapped to RFC7807 validation errors (400)
   * Jest expects "validation_error" for malformed JSON bodies (no instance field).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const isParseError = err?.type === 'entity.parse.failed' || err instanceof SyntaxError;
    if (isParseError) {
      return res.status(400).type('application/problem+json').json({
        type: 'https://peacprotocol.org/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    }
    return _next(err);
  });

  if (config.gates.healthEnabled) {
    app.get('/healthz', async (_req, res) => {
      const health: {
        status: 'ok' | 'degraded';
        version: string;
        components: Record<string, string>;
      } = { status: 'ok', version: WIRE_VERSION, components: {} };
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

  // v0.9.8 JWKS endpoint
  app.get('/.well-known/jwks.json', (req, res) => jwksManager.handleJWKSRequest(req, res));

  // v0.9.8 Discovery endpoints
  app.use(
    createDiscoveryRouter(adapterRegistry, {
      base_url: process.env.PEAC_BASE_URL || 'https://demo.peac.dev',
      version: WIRE_VERSION,
      x_release: WIRE_VERSION,
    }),
  );

  // v0.9.8 OAuth device flow endpoints
  app.use('/oauth', createDeviceFlowRouter(redis, jwksManager));

  app.use('/', createRoutes());

  // Global error handlers - must be last
  app.use(PEACError.handler);
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
