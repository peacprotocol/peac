/**
 * @peac/app-bridge - Local Development Sidecar
 *
 * Bridge HTTP server on port 31415 with /enforce, /verify, /health endpoints
 * Wire version: 0.9.13, Implementation: 0.9.13.2
 */

import { Hono } from 'hono';
import type { Context } from 'hono';

// Define context variables for type safety
interface Variables {
  requestId: string;
  traceparent?: string;
}
import { serve } from '@hono/node-server';
import { randomUUID } from 'crypto';
import { enforceRoute } from './routes/enforce.js';
import { verifyRoute } from './routes/verify.js';
import { healthRoute } from './routes/health.js';
import { readinessRoute } from './routes/readiness.js';
import { metricsRoute } from './routes/metrics.js';
import { peacHeaders } from './util/http.js';
import { rateLimiter } from '@peac/core/src/rate-limit.js';
import { Problems } from '@peac/core/src/problems.js';

const DEFAULT_PORT = 31415;
const METRICS_PORT = 31416;

export function createBridgeApp() {
  const app = new Hono<{ Variables: Variables }>();

  // Generate request ID for correlation
  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    await next();
  });

  // CORS and standard headers on ALL responses
  const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pickOrigin = (origin?: string) => {
    if (!origin) return ALLOW_ORIGINS[0] ?? '';
    return ALLOW_ORIGINS.includes(origin) ? origin : (ALLOW_ORIGINS[0] ?? '');
  };

  app.use('*', async (c, next) => {
    await next();
    const aiprefUrl = new URL('/.well-known/aipref.json', c.req.url).toString();
    const agentPermUrl = new URL('/agent-permissions.json', c.req.url).toString();
    const origin = pickOrigin(c.req.header('Origin'));
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PAYMENT');
    c.header('Access-Control-Expose-Headers', 'PEAC-Receipt, Link');
    c.header('Link', `<${aiprefUrl}>; rel="aipref", <${agentPermUrl}>; rel="agent-permissions"`);
    c.header('X-Request-ID', c.get('requestId'));
  });

  // Rate limiting middleware
  app.use('*', async (c, next) => {
    const clientIP =
      c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const result = await rateLimiter.checkLimit(clientIP, 'agent');

    if (!result.allowed) {
      const headers = rateLimiter.createHeaders(result);
      const problem = Problems.rateLimited(
        result.retry_after || 60,
        result.limit,
        c.get('requestId')
      );

      return c.newResponse(
        JSON.stringify(problem),
        429,
        peacHeaders({
          'Content-Type': 'application/problem+json; charset=utf-8',
          'X-Request-ID': c.get('requestId'),
          'Retry-After': headers['Retry-After'] || '60',
          'RateLimit-Limit': headers['RateLimit-Limit'],
          'RateLimit-Remaining': headers['RateLimit-Remaining'],
          'RateLimit-Reset': headers['RateLimit-Reset'],
        })
      );
    }

    await next();
  });

  // Request tracking for traces
  app.use('*', async (c, next) => {
    const traceparent = c.req.header('traceparent');
    if (traceparent) {
      c.set('traceparent', traceparent);
    }
    await next();
  });

  // Core routes
  app.post('/enforce', enforceRoute);
  app.post('/verify', verifyRoute);
  app.get('/health', healthRoute);
  // Explicit HEAD for health (some monitors depend on it)
  app.on('HEAD', '/health', (c) =>
    c.newResponse(
      '',
      200,
      peacHeaders({ 'Content-Type': 'application/peac+json', 'X-Request-ID': c.get('requestId') })
    )
  );
  app.get('/ready', readinessRoute);

  // Bridge info endpoint
  app.get('/', (c) => {
    const body = JSON.stringify({
      name: '@peac/app-bridge',
      version: '0.9.13.2',
      wire_version: '0.9.13',
      description: 'PEAC Protocol Bridge - Local development sidecar',
      endpoints: {
        '/health': 'GET/HEAD - Bridge health status',
        '/ready': 'GET - Bridge readiness check',
        '/enforce': 'POST - Core orchestration (discover → evaluate → settle → prove)',
        '/verify': 'POST - Receipt verification and policy validation',
      },
      ports: { http: 31415, metrics: 31416 },
      performance_targets: { enforce_p95_ms: 5, verify_p95_ms: 5, cpu_idle_at_100rps: '< 5%' },
    });
    return c.newResponse(
      body,
      200,
      peacHeaders({ 'Content-Type': 'application/peac+json', 'X-Request-ID': c.get('requestId') })
    );
  });

  // OPTIONS handler for CORS preflight
  app.options('*', (c) => {
    const origin = pickOrigin(c.req.header('Origin'));
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PAYMENT');
    c.header('Access-Control-Expose-Headers', 'PEAC-Receipt, Link');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '600');
    c.header('Vary', 'Origin');
    return c.newResponse('', 204);
  });

  // 404 handler
  app.notFound((c) => {
    const body = JSON.stringify({
      type: 'https://peacprotocol.org/problems/not-found',
      status: 404,
      title: 'Not Found',
      detail: `Endpoint ${c.req.path} not found on bridge`,
      instance: c.req.url,
    });
    return c.newResponse(
      body,
      404,
      peacHeaders({
        'Content-Type': 'application/problem+json; charset=utf-8',
        'X-Request-ID': c.get('requestId'),
      })
    );
  });

  return app;
}

export async function startBridge(options: { port?: number } = {}) {
  const port = process.env.PEAC_BRIDGE_PORT
    ? parseInt(process.env.PEAC_BRIDGE_PORT)
    : options.port || DEFAULT_PORT;
  const host = '127.0.0.1'; // hard lock to loopback (dev-sidecar by design)

  const app = createBridgeApp();

  console.log(`PEAC Bridge v0.9.13.2 starting...`);
  console.log(`HTTP: http://${host}:${port}`);

  // Start main server
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  // Start metrics server on separate port if enabled
  if (process.env.PEAC_ENABLE_METRICS === '1' || process.env.PEAC_ENABLE_METRICS === 'true') {
    const metricsApp = new Hono();
    metricsApp.get('/metrics', metricsRoute);

    serve({
      fetch: metricsApp.fetch,
      port: METRICS_PORT,
      hostname: host,
    });

    console.log(`Metrics: http://${host}:${METRICS_PORT}/metrics`);
  }

  console.log(`Bridge ready - Wire version: 0.9.13`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
  });

  return { server, app };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  startBridge().catch((error) => {
    console.error('Failed to start bridge:', error);
    process.exit(1);
  });
}
