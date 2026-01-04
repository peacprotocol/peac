/**
 * PEAC Attribution Package (v0.9.26+)
 *
 * Content derivation and usage proofs for PEAC receipts.
 * Enables chain tracking and compliance artifacts.
 *
 * @packageDocumentation
 * @module @peac/attribution
 *
 * @example
 * ```typescript
 * import {
 *   createAttribution,
 *   verify,
 *   computeContentHash,
 * } from '@peac/attribution';
 *
 * // Create an attribution attestation
 * const attestation = createAttribution({
 *   issuer: 'https://ai.example.com',
 *   sources: [
 *     {
 *       receipt_ref: 'jti:rec_abc123',
 *       usage: 'rag_context',
 *       weight: 0.8,
 *     },
 *   ],
 *   derivation_type: 'rag',
 *   model_id: 'gpt-4',
 * });
 *
 * // Verify an attestation
 * const result = await verify(attestation);
 * if (result.valid) {
 *   console.log('Attribution valid');
 * }
 * ```
 */

// Re-export types and schemas from @peac/schema
export {
  // Schemas
  HashAlgorithmSchema,
  HashEncodingSchema,
  ContentHashSchema,
  AttributionUsageSchema,
  DerivationTypeSchema,
  AttributionSourceSchema,
  AttributionEvidenceSchema,
  AttributionAttestationSchema,
  // Constants
  ATTRIBUTION_TYPE,
  ATTRIBUTION_LIMITS,
  ATTRIBUTION_USAGES,
  DERIVATION_TYPES,
  // Type guards and validators
  validateContentHash,
  validateAttributionSource,
  validateAttributionAttestation,
  isAttributionAttestation,
  isAttributionExpired,
  isAttributionNotYetValid,
  computeTotalWeight,
  detectCycleInSources,
  // Factory function from schema (basic)
  createAttributionAttestation,
} from '@peac/schema';

// Re-export types from @peac/schema
export type {
  HashAlgorithm,
  HashEncoding,
  ContentHash,
  AttributionUsage,
  DerivationType,
  AttributionSource,
  AttributionEvidence,
  AttributionAttestation,
  ChainVerificationResult,
  CreateAttributionAttestationParams,
} from '@peac/schema';

// Package-specific exports
export {
  // Hash utilities
  computeContentHash,
  computeExcerptHash,
  verifyContentHash,
  // Base64url normalization
  normalizeBase64url,
  base64urlEqual,
} from './hash.js';

export {
  // Error codes and factories
  ATTRIBUTION_ERROR_CODES,
  createAttributionError,
  createMissingSourcesError,
  createInvalidFormatError,
  createInvalidRefError,
  createHashInvalidError,
  createUnknownUsageError,
  createInvalidWeightError,
  createCircularChainError,
  createChainTooDeepError,
  createTooManySourcesError,
  createSizeExceededError,
  createResolutionFailedError,
  createResolutionTimeoutError,
  createNotYetValidError,
  createExpiredError,
} from './errors.js';
export type { AttributionErrorCode } from './errors.js';

export {
  // Chain verification
  detectCycle,
  verifyChain,
  collectReceiptRefs,
  flattenChain,
} from './chain.js';
export type { ReceiptResolver, ChainVerificationOptions } from './chain.js';

export {
  // Attestation verification
  verify,
  verifySync,
  verifySourceContent,
  verifySourceExcerpt,
  verifyOutput,
} from './verify.js';
export type { VerifyOptions, VerifyResult } from './verify.js';

// Convenience alias for createAttributionAttestation
export { createAttributionAttestation as createAttribution } from '@peac/schema';
