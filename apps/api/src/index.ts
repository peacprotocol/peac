/**
 * @peac/api - PEAC verify API with RFC 9457 Problem Details
 * Framework-agnostic verify endpoint implementations + HTTP server
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createV13HonoHandler } from './routes.js';
import { createVerifyV1Handler } from './verify-v1.js';
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

// Legacy enhanced verifier (deprecated -- kept for backwards compat, will be removed)
export { VerifierV13 } from './verifier.js';
export { createV13ExpressHandler, createV13HonoHandler } from './routes.js';
export type { V13VerifyRequest, V13VerifyResponse, VerifierOptions } from './verifier.js';

// v1 verify endpoint
export { createVerifyV1Handler, resetVerifyV1RateLimit } from './verify-v1.js';

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

// HTTP Server (when run as application)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new Hono();

  // Global error handler: ProblemError -> RFC 9457 JSON response
  app.onError((err, c) => {
    c.header('Content-Type', PROBLEM_MEDIA_TYPE);
    if (isProblemError(err)) {
      const problem = err.toProblemDetails();
      return c.body(JSON.stringify(problem), problem.status);
    }
    return c.body(
      JSON.stringify({
        type: 'https://www.peacprotocol.org/problems/processing-error',
        title: 'Processing Error',
        status: 500,
        detail: 'An internal error occurred',
      }),
      500
    );
  });

  // Health check endpoint
  app.get('/health', (c) => c.json({ ok: true }));

  // Legacy verify endpoint (deprecated -- will be removed in a future version)
  app.post('/verify', createV13HonoHandler());

  // v1 verify endpoint
  app.post('/api/v1/verify', createVerifyV1Handler());

  // Start server
  const port = parseInt(process.env.PORT || '3000');
  const version = process.env.npm_package_version || 'dev';

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`PEAC Verify API v${version} listening on http://localhost:${port}`);
}
