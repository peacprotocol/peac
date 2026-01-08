/**
 * @peac/worker-core - Safe Public API
 *
 * Runtime-neutral TAP verification handler for edge workers.
 * This is the safe, production-ready API surface.
 *
 * For unsafe development options (NOT for production), import from:
 * ```ts
 * import { parseUnsafeConfigFromEnv } from '@peac/worker-core/unsafe';
 * ```
 *
 * @packageDocumentation
 */

// -----------------------------------------------------------------------------
// Types (Safe subset only)
// -----------------------------------------------------------------------------

export type {
  // Config types
  SafeWorkerConfig,

  // Request/Response types
  RequestLike,
  HandlerResult,

  // Replay store interface
  ReplayStore,
  ReplayContext,

  // Verification result
  VerificationResult,
} from './types.js';

// -----------------------------------------------------------------------------
// Error handling
// -----------------------------------------------------------------------------

export {
  ErrorCodes,
  ERROR_STATUS_MAP,
  getStatusForError,
  createProblemDetails,
  mapTapErrorCode,
  type ProblemDetails,
} from './errors.js';

// -----------------------------------------------------------------------------
// Response building
// -----------------------------------------------------------------------------

export { buildErrorResponse, buildChallengeResponse, type ResponseParts } from './response.js';

// -----------------------------------------------------------------------------
// Replay protection
// -----------------------------------------------------------------------------

export { hashReplayKey } from './hash.js';

export { LRUReplayStore, NoOpReplayStore } from './replay.js';

// -----------------------------------------------------------------------------
// Configuration (Safe only)
// -----------------------------------------------------------------------------

export {
  parseSafeConfigFromEnv,
  toInternalConfig,
  matchesBypassPath,
  isIssuerAllowed,
} from './config.js';

// -----------------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------------

export {
  hasTapHeaders,
  extractIssuerFromKeyid,
  headersToPlainObject,
  verifyTap,
  handleVerification,
} from './verification.js';

// -----------------------------------------------------------------------------
// Handler Factories
// -----------------------------------------------------------------------------

export { createHandler, type Handler, type ErrorResponse } from './handler.js';
