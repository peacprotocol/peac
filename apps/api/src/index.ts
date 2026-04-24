/**
 * @peac/api - PEAC verify API with RFC 9457 Problem Details
 * Framework-agnostic verify endpoint implementations + HTTP server
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createVerifyV1Handler } from './verify-v1.js';
import { createIssueV1Handler } from './hosted-issue.js';
import { createIssuerHealthHandler } from './issuer-health.js';
import { isProblemError } from './errors.js';

// Legacy handlers (deprecated -- use createVerifyV1Handler instead)
export {
  VerifyApiHandler,
  createExpressHandler,
  createHonoHandler,
  createGenericHandler,
} from './handler.js';
export {
  ProblemError,
  isProblemError,
  createProblemDetails,
  handleVerifyError,
  validationError,
} from './errors.js';
export type {
  ProblemDetails,
  VerifyRequest,
  VerifyResponse,
  VerifyErrorDetails,
  ErrorContext,
  HttpStatus,
} from './types.js';

// v1 verify endpoint
export { createVerifyV1Handler, resetVerifyV1RateLimit } from './verify-v1.js';

// v1 issue endpoint (provisional)
export { createIssueV1Handler } from './hosted-issue.js';

// v1 issuer health probe (reference, self-hostable)
export { createIssuerHealthHandler } from './issuer-health.js';

// Error catalog (for testing and external consumption)
export { HOSTED_ERROR_CODES, toProblemDetails, getCatalogEntry } from './error-catalog.js';
export type { CatalogEntry, HostedProblemDetails } from './error-catalog.js';

// RFC 9457 Problem Details media type
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

// Common PEAC problem type URIs
export const PROBLEM_TYPES = {
  INVALID_JWS: 'https://www.peacprotocol.org/problems/invalid-jws-format',
  MISSING_RECEIPT: 'https://www.peacprotocol.org/problems/missing-receipt',
  INVALID_REQUEST: 'https://www.peacprotocol.org/problems/invalid-request',
  INVALID_SIGNATURE: 'https://www.peacprotocol.org/problems/invalid-signature',
  UNKNOWN_KEY: 'https://www.peacprotocol.org/problems/unknown-key-id',
  SCHEMA_VALIDATION: 'https://www.peacprotocol.org/problems/schema-validation-failed',
  EXPIRED_RECEIPT: 'https://www.peacprotocol.org/problems/expired-receipt',
  PROCESSING_ERROR: 'https://www.peacprotocol.org/problems/processing-error',
  MISCONFIGURED_VERIFIER: 'https://www.peacprotocol.org/problems/misconfigured-verifier',
} as const;

/**
 * Deprecation headers for the legacy `POST /verify` alias and any other
 * route that predates `POST /v1/verify`. The alias keeps serving valid
 * `/v1/verify`-shaped responses, but every response carries an RFC 9745
 * `Deprecation` marker, an RFC 8594 `Sunset` date, and an RFC 8288
 * `Link` relation pointing at the migration guide.
 */
export const LEGACY_VERIFY_DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Sunset: 'Sat, 01 Nov 2026 00:00:00 GMT',
  Link: '<https://www.peacprotocol.org/docs/migration>; rel="deprecation"',
} as const;

// HTTP Server (when run as application)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new Hono();

  // Global error handler: ProblemError -> RFC 9457 JSON response
  app.onError((err) => {
    const headers = { 'Content-Type': PROBLEM_MEDIA_TYPE };
    if (isProblemError(err)) {
      const problem = err.toProblemDetails();
      return new Response(JSON.stringify(problem), {
        status: problem.status,
        headers,
      });
    }
    return new Response(
      JSON.stringify({
        type: 'https://www.peacprotocol.org/problems/processing-error',
        title: 'Processing Error',
        status: 500,
        detail: 'An internal error occurred',
      }),
      { status: 500, headers }
    );
  });

  // Health check endpoint
  app.get('/health', (c) => c.json({ ok: true }));

  // Canonical v1 verify endpoint
  const verifyV1 = createVerifyV1Handler();
  app.post('/v1/verify', verifyV1);

  // Legacy verify endpoint. Kept runtime-reachable through the advertised
  // Sunset date. The alias delegates in-process to the canonical v1
  // handler and stamps deprecation headers on every response.
  app.post('/verify', (c) => {
    for (const [k, v] of Object.entries(LEGACY_VERIFY_DEPRECATION_HEADERS)) c.header(k, v);
    return verifyV1(c);
  });

  // Deprecated alias (Sunset: Nov 1 2026)
  app.post('/api/v1/verify', (c) => {
    for (const [k, v] of Object.entries(LEGACY_VERIFY_DEPRECATION_HEADERS)) c.header(k, v);
    return verifyV1(c);
  });

  // Provisional v1 issue endpoint (BYO-key, disable via PEAC_HOSTED_ISSUE=false)
  app.post('/v1/issue', createIssueV1Handler());

  // Reference issuer health probe (query-param API, SSRF-safe, self-hostable)
  app.get('/v1/issuer-health', createIssuerHealthHandler());

  // Start server
  const port = parseInt(process.env.PORT || '3000');
  const version = process.env.npm_package_version || 'dev';

  const server = serve({
    fetch: app.fetch,
    port,
  });

  console.log(`PEAC Verify API v${version} listening on http://localhost:${port}`);

  const SHUTDOWN_TIMEOUT_MS = 10_000;

  function shutdown(signal: string) {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
