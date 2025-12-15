/**
 * @peac/mappings-tap
 *
 * Visa Trusted Agent Protocol (TAP) mapping to PEAC control evidence.
 */

// Types
export type {
  TapTag,
  TapRequest,
  TapKeyResolver,
  TapVerifyOptions,
  TapEvidence,
  TapControlEntry,
  TapVerificationResult,
} from './types.js';

export { TAP_TAGS, TAP_CONSTANTS } from './types.js';

// Mapper
export { verifyTapProof, createDeniedControlEntry } from './mapper.js';

// Validator
export {
  validateTapTimeConstraints,
  validateTapAlgorithm,
  validateTapTag,
  isKnownTapTag,
} from './validator.js';

// Helpers
export { headersToRecord, getHeader } from './helpers.js';

// Errors
export { ErrorCodes, ErrorHttpStatus, TapError } from './errors.js';
export type { ErrorCode } from './errors.js';
