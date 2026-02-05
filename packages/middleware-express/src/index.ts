/**
 * PEAC Middleware for Express.js
 *
 * Express.js middleware for automatic PEAC receipt issuance.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { peacMiddleware } from '@peac/middleware-express';
 *
 * const app = express();
 *
 * app.use(peacMiddleware({
 *   issuer: 'https://api.example.com',
 *   signingKey: {
 *     kty: 'OKP',
 *     crv: 'Ed25519',
 *     x: '<base64url public key>',
 *     d: '<base64url private key>',
 *   },
 *   keyId: 'prod-2026-02',
 * }));
 *
 * app.get('/api/data', (req, res) => {
 *   res.json({ message: 'Hello World' });
 *   // PEAC-Receipt header automatically added
 * });
 * ```
 *
 * @packageDocumentation
 */

// Middleware
export {
  peacMiddleware,
  peacMiddlewareSync,
  getReceiptFromResponse,
  hasPeacContext,
} from './middleware.js';

// Types
export type { ExpressMiddlewareConfig, RequestWithPeacContext } from './middleware.js';

// Re-export core types for convenience
export type {
  MiddlewareConfig,
  RequestContext,
  ResponseContext,
  ReceiptResult,
  Ed25519PrivateJwk,
} from '@peac/middleware-core';
