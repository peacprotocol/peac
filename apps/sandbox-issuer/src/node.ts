/**
 * Node.js server entry point
 *
 * Binds the portable Hono app to @hono/node-server on port 3100.
 * For Cloudflare Workers, export { app } from './app.js' instead.
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = parseInt(process.env.PORT ?? '3100', 10);
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Sandbox issuer listening on http://127.0.0.1:${port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
