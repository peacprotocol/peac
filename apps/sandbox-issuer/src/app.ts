/**
 * Sandbox Issuer Hono App
 *
 * Portable -- no server binding. Use node.ts for Node.js server,
 * or export default { fetch: app.fetch } for Cloudflare Workers.
 */

import { Hono } from 'hono';
import { healthHandler } from './routes/health.js';
import { issuerConfigHandler, jwksHandler } from './routes/discovery.js';
import { issueHandler } from './routes/issue.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { corsMiddleware } from './middleware/cors.js';
import { securityHeaders } from './middleware/security-headers.js';

const app = new Hono();

// Global security headers on all responses
app.use('*', securityHeaders);

// CORS on discovery endpoints (browser verifier needs cross-origin access)
app.use('/.well-known/*', corsMiddleware);

// Routes
app.get('/health', healthHandler);
app.get('/.well-known/peac-issuer.json', issuerConfigHandler);
app.get('/.well-known/jwks.json', jwksHandler);

// Issue endpoint with rate limiting
app.post('/api/v1/issue', rateLimitMiddleware, issueHandler);

export { app };
