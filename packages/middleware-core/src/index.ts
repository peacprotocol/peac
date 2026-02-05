/**
 * PEAC Middleware Core
 *
 * Framework-agnostic middleware primitives for PEAC receipt issuance.
 *
 * This package provides the core building blocks for integrating PEAC
 * receipt issuance into any HTTP framework. For framework-specific
 * implementations, see:
 * - `@peac/middleware-express` for Express.js
 *
 * @example
 * ```typescript
 * import { createReceipt, validateConfig, wrapResponse } from '@peac/middleware-core';
 *
 * // Validate configuration at startup
 * validateConfig(config);
 *
 * // In request handler
 * const result = await createReceipt(config, requestCtx, responseCtx);
 *
 * // Add headers
 * for (const [key, value] of Object.entries(result.headers)) {
 *   res.setHeader(key, value);
 * }
 *
 * // Handle body transport
 * if (result.bodyWrapper) {
 *   res.json(result.bodyWrapper);
 * } else {
 *   res.json(originalBody);
 * }
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  MiddlewareConfig,
  RequestContext,
  ResponseContext,
  ReceiptResult,
  ReceiptClaimsInput,
  ConfigValidationError,
  Ed25519PrivateJwk,
  TransportSelectionInput,
} from './types.js';

// Configuration
export { validateConfig, ConfigError, CONFIG_DEFAULTS, applyDefaults } from './config.js';

// Transport
export {
  selectTransport,
  wrapResponse,
  buildResponseHeaders,
  buildReceiptResult,
} from './transport.js';

// Receipt generation
export { createReceipt, createReceiptWithClaims } from './receipt.js';
