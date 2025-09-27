/**
 * @peac/api - PEAC verify API with RFC 9457 Problem Details
 * Framework-agnostic verify endpoint implementations + HTTP server
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createV13HonoHandler } from './routes.js';

// Legacy v0.9.12 handlers
export {
  VerifyApiHandler,
  createExpressHandler,
  createHonoHandler,
  createGenericHandler,
} from './handler.js';
export {
  ProblemError,
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

// v0.9.13.1 enhanced verifier
export { VerifierV13 } from './verifier.js';
export { createV13ExpressHandler, createV13HonoHandler } from './routes.js';
export type { V13VerifyRequest, V13VerifyResponse, VerifierOptions } from './verifier.js';

// RFC 9457 Problem Details media type
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

// Common PEAC problem type URIs
export const PROBLEM_TYPES = {
  INVALID_JWS: 'https://peacprotocol.org/problems/invalid-jws-format',
  MISSING_RECEIPT: 'https://peacprotocol.org/problems/missing-receipt',
  INVALID_SIGNATURE: 'https://peacprotocol.org/problems/invalid-signature',
  UNKNOWN_KEY: 'https://peacprotocol.org/problems/unknown-key-id',
  SCHEMA_VALIDATION: 'https://peacprotocol.org/problems/schema-validation-failed',
  EXPIRED_RECEIPT: 'https://peacprotocol.org/problems/expired-receipt',
  PROCESSING_ERROR: 'https://peacprotocol.org/problems/processing-error',
} as const;

// HTTP Server (when run as application)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => c.json({ ok: true }));

  // v0.9.13.1 verify endpoint
  app.post('/verify', createV13HonoHandler());

  // Start server
  const port = parseInt(process.env.PORT || '3000');
  console.log(`PEAC Verify API v0.9.13.1 starting on port ${port}`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`Server running at http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Verify endpoint: POST http://localhost:${port}/verify`);
}
