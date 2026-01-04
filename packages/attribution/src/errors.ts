/**
 * Attribution Error Helpers (v0.9.26+)
 *
 * Factory functions for creating structured attribution errors.
 */
import { ERRORS } from '@peac/kernel';
import type { PEACError, ErrorCategory, ErrorSeverity } from '@peac/schema';

/**
 * Attribution error codes (strict union type for type safety).
 *
 * These codes are registered in specs/kernel/errors.json under the 'attribution' category.
 */
export const ATTRIBUTION_ERROR_CODES = [
  'E_ATTRIBUTION_MISSING_SOURCES',
  'E_ATTRIBUTION_INVALID_FORMAT',
  'E_ATTRIBUTION_INVALID_REF',
  'E_ATTRIBUTION_HASH_INVALID',
  'E_ATTRIBUTION_UNKNOWN_USAGE',
  'E_ATTRIBUTION_INVALID_WEIGHT',
  'E_ATTRIBUTION_CIRCULAR_CHAIN',
  'E_ATTRIBUTION_CHAIN_TOO_DEEP',
  'E_ATTRIBUTION_TOO_MANY_SOURCES',
  'E_ATTRIBUTION_SIZE_EXCEEDED',
  'E_ATTRIBUTION_RESOLUTION_FAILED',
  'E_ATTRIBUTION_RESOLUTION_TIMEOUT',
  'E_ATTRIBUTION_NOT_YET_VALID',
  'E_ATTRIBUTION_EXPIRED',
] as const;

/**
 * Strict type for attribution error codes.
 * Prevents typos and ensures only valid attribution error codes are used.
 */
export type AttributionErrorCode = (typeof ATTRIBUTION_ERROR_CODES)[number];

/**
 * Create a structured attribution error.
 *
 * @param code - Attribution error code (strictly typed)
 * @param remediation - Human-readable remediation guidance
 * @param details - Additional error details
 * @returns Structured PEACError
 */
export function createAttributionError(
  code: AttributionErrorCode,
  remediation: string,
  details?: Record<string, unknown>
): PEACError {
  const errorDef = ERRORS[code];
  return {
    code,
    category: (errorDef?.category ?? 'validation') as ErrorCategory,
    severity: 'error' as ErrorSeverity,
    retryable: errorDef?.retriable ?? false,
    http_status: errorDef?.http_status ?? 400,
    remediation,
    details,
  };
}

/**
 * Create an error for missing sources.
 */
export function createMissingSourcesError(): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_MISSING_SOURCES',
    'Attribution attestation must have at least one source in the sources array'
  );
}

/**
 * Create an error for invalid attestation format.
 */
export function createInvalidFormatError(reason: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_INVALID_FORMAT',
    `Schema validation failed: ${reason}`,
    { reason }
  );
}

/**
 * Create an error for invalid receipt reference.
 */
export function createInvalidRefError(receiptRef: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_INVALID_REF',
    `Invalid receipt reference format. Must be jti:{id}, https://..., or urn:peac:receipt:{id}`,
    { receiptRef }
  );
}

/**
 * Create an error for invalid content hash.
 */
export function createHashInvalidError(reason: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_HASH_INVALID',
    `Content hash validation failed: ${reason}`,
    { reason }
  );
}

/**
 * Create an error for unknown usage type.
 */
export function createUnknownUsageError(usage: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_UNKNOWN_USAGE',
    `Unknown attribution usage type. Valid types: training_input, rag_context, direct_reference, synthesis_source, embedding_source`,
    { usage }
  );
}

/**
 * Create an error for invalid weight.
 */
export function createInvalidWeightError(weight: number): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_INVALID_WEIGHT',
    `Attribution weight must be between 0.0 and 1.0 inclusive`,
    { weight }
  );
}

/**
 * Create an error for circular chain reference.
 */
export function createCircularChainError(receiptRef: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_CIRCULAR_CHAIN',
    `Circular reference detected in attribution chain. Remove the duplicate reference to break the cycle`,
    { receiptRef }
  );
}

/**
 * Create an error for chain depth exceeded.
 */
export function createChainTooDeepError(depth: number, maxDepth: number): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_CHAIN_TOO_DEEP',
    `Attribution chain depth ${depth} exceeds maximum allowed depth of ${maxDepth}. Flatten the chain or increase maxDepth option`,
    { depth, maxDepth }
  );
}

/**
 * Create an error for too many sources.
 */
export function createTooManySourcesError(count: number, maxSources: number): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_TOO_MANY_SOURCES',
    `Attribution has ${count} sources but maximum allowed is ${maxSources}. Reduce sources or increase limit`,
    { count, maxSources }
  );
}

/**
 * Create an error for attestation size exceeded.
 */
export function createSizeExceededError(size: number, maxSize: number): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_SIZE_EXCEEDED',
    `Attribution attestation is ${size} bytes but maximum allowed is ${maxSize} bytes. Reduce content or split attestation`,
    { size, maxSize }
  );
}

/**
 * Create an error for resolution failure.
 */
export function createResolutionFailedError(receiptRef: string, reason: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_RESOLUTION_FAILED',
    `Failed to resolve receipt reference: ${reason}. Check that the receipt exists and is accessible`,
    { receiptRef, reason }
  );
}

/**
 * Create an error for resolution timeout.
 */
export function createResolutionTimeoutError(receiptRef: string, timeout: number): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_RESOLUTION_TIMEOUT',
    `Resolution timed out after ${timeout}ms. Increase timeout or check network connectivity`,
    { receiptRef, timeout }
  );
}

/**
 * Create an error for attestation not yet valid.
 */
export function createNotYetValidError(issuedAt: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_NOT_YET_VALID',
    `Attribution attestation issued_at ${issuedAt} is in the future. Check clock synchronization`,
    { issuedAt }
  );
}

/**
 * Create an error for expired attestation.
 */
export function createExpiredError(expiresAt: string): PEACError {
  return createAttributionError(
    'E_ATTRIBUTION_EXPIRED',
    `Attribution attestation expired at ${expiresAt}. Request a new attestation`,
    { expiresAt }
  );
}
