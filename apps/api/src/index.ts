/**
 * @peac/api - PEAC verify API with RFC 9457 Problem Details
 * Framework-agnostic verify endpoint implementations + HTTP server
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createV13HonoHandler } from './routes.js';
import { createVerifyV1Handler } from './verify-v1.js';

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

// v1 verify endpoint
export { createVerifyV1Handler } from './verify-v1.js';

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

  // Health check endpoint
  app.get('/health', (c) => c.json({ ok: true }));

  // v0.9.13.1 verify endpoint (legacy)
  app.post('/verify', createV13HonoHandler());

  // v1 verify endpoint
  app.post('/api/v1/verify', createVerifyV1Handler());

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
