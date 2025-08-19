/* istanbul ignore file */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getRedis } from '../utils/redis-pool';
import { getMetricsRegistry } from '../metrics';
import { createRoutes } from './routes';
import { config } from '../config';
import { handleMetrics } from '../metrics/prom';
import { handleLiveness, handleReadiness } from '../health/http';
import { createSLOManager } from '../slo';
import { createDataProtectionManager } from '../privacy';

export async function createServer() {
  const app = express();

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Set trust proxy for accurate IP detection
  app.set('trust proxy', true);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          fontSrc: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: { policy: 'require-corp' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      xssFilter: false, // Set to false to disable X-XSS-Protection completely
    }),
  );

  // Set strict Permissions-Policy
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), ' +
        'camera=(), cross-origin-isolated=(), display-capture=(), ' +
        'document-domain=(), encrypted-media=(), execution-while-not-rendered=(), ' +
        'execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), ' +
        'gyroscope=(), magnetometer=(), microphone=(), midi=(), ' +
        'navigation-override=(), payment=(), picture-in-picture=(), ' +
        'publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), ' +
        'usb=(), web-share=(), xr-spatial-tracking=()',
    );
    next();
  });
  app.use(cors({ origin: config.gates.corsOrigins }));

  // Raw body middleware for webhook verification
  app.use(
    '/webhooks/peac',
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req, _res, next) => {
      // Store raw body for HMAC verification
      (req as any).rawBody = req.body.toString();

      // Parse JSON from raw body for validation
      try {
        req.body = JSON.parse((req as any).rawBody);
      } catch (error) {
        // Invalid JSON will be handled by validation middleware
      }

      next();
    },
  );

  app.use(express.json({ limit: '1mb' }));

  // Health endpoints
  app.get('/livez', handleLiveness);
  app.get('/readyz', handleReadiness);

  // Legacy health endpoint for backward compatibility
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

  // Metrics endpoints - only mount when enabled
  if (config.gates.metricsEnabled || config.peac.metricsEnabled) {
    app.get('/metrics', handleMetrics);

    // Legacy metrics endpoint
    app.get('/metrics/legacy', async (_req, res) => {
      const reg = getMetricsRegistry();
      res.setHeader('Content-Type', reg.contentType);
      res.send(await reg.metrics());
    });
  }

  // Initialize SLO manager if explicitly enabled (dark feature)
  let sloManager;
  if (config.gates.sloEnabled) {
    sloManager = createSLOManager();
    sloManager.start();
  }

  // Initialize data protection manager if explicitly enabled (dark feature)
  let dataProtection;
  if (config.gates.privacyEnabled) {
    dataProtection = createDataProtectionManager();
  }

  app.use('/', createRoutes(sloManager, dataProtection));
  return app;
}
