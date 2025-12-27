/**
 * PEAC Shared Worker Core
 *
 * Runtime-neutral verification logic for edge workers.
 *
 * This module provides the shared implementation that all edge workers
 * (Cloudflare, Fastly, Akamai) use for TAP verification.
 *
 * Each runtime implements:
 * - Environment bindings
 * - Replay store implementations
 * - Response creation
 * - Entry point
 *
 * @packageDocumentation
 */

// Types
export type {
  WorkerConfig,
  ReplayContext,
  ReplayStore,
  VerificationResult,
  ProblemDetails,
  HeadersLike,
  RequestLike,
  VerifyTapOptions,
  HandlerResult,
} from './types.js';

// Config utilities
export {
  parseCommaSeparated,
  parseBool,
  parseConfigFromEnv,
  matchesBypassPath,
  isIssuerAllowed,
} from './config.js';

// Error utilities
export {
  ErrorCodes,
  type ErrorCode,
  type ErrorCodeValue,
  sanitizeDetail,
  createProblemDetails,
  getStatusForCode,
  mapTapErrorCode,
} from './errors.js';

// Hashing utilities
export { hashReplayKey } from './hash.js';

// Verification logic
export {
  hasTapHeaders,
  extractIssuerFromKeyid,
  headersToPlainObject,
  verifyTap,
  handleVerification,
} from './verification.js';
