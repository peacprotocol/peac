/**
 * @peac/api - PEAC verify API with RFC 9457 Problem Details
 * Framework-agnostic verify endpoint implementations
 */

export { VerifyApiHandler, createExpressHandler, createHonoHandler, createGenericHandler } from './handler.js';
export { ProblemError, createProblemDetails, handleVerifyError, validationError } from './errors.js';
export type { 
  ProblemDetails,
  VerifyRequest,
  VerifyResponse,
  VerifyErrorDetails,
  ErrorContext,
  HttpStatus
} from './types.js';

// RFC 9457 Problem Details media type
export const PROBLEM_MEDIA_TYPE = 'application/problem+json';

// Common PEAC problem type URIs
export const PROBLEM_TYPES = {
  INVALID_JWS: 'https://peac.dev/problems/invalid-jws-format',
  MISSING_RECEIPT: 'https://peac.dev/problems/missing-receipt',
  INVALID_SIGNATURE: 'https://peac.dev/problems/invalid-signature',
  UNKNOWN_KEY: 'https://peac.dev/problems/unknown-key-id',
  SCHEMA_VALIDATION: 'https://peac.dev/problems/schema-validation-failed',
  EXPIRED_RECEIPT: 'https://peac.dev/problems/expired-receipt',
  PROCESSING_ERROR: 'https://peac.dev/problems/processing-error'
} as const;