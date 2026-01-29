/**
 * PEAC Adapter Core
 *
 * Shared utilities for PEAC payment rail adapters.
 * Provides Result types and validators for consistent adapter implementation.
 *
 * @packageDocumentation
 */

// Re-export JSON types from kernel for convenience
export type { JsonPrimitive, JsonValue, JsonArray, JsonObject } from '@peac/kernel';

// Result utilities
export {
  type Result,
  ok,
  err,
  adapterErr,
  isOk,
  isErr,
  map,
  mapErr,
  chain,
  unwrap,
  unwrapOr,
} from './result.js';

// Types
export type { AdapterError, AdapterErrorCode } from './types.js';

// Validators
export {
  requireString,
  optionalString,
  requireNumber,
  requireAmount,
  requireCurrency,
  optionalNetwork,
  requireObject,
  optionalTimestamp,
  optionalBoolean,
  requireEnum,
  optionalEnum,
} from './validators.js';

// Payment Proof Adapter Interface
export type {
  NormalizedTerms,
  NormalizedSettlement,
  TermsVerification,
  SettlementVerification,
  VerificationError,
  PaymentProofRecord,
  VerificationContext,
  PaymentProofAdapter,
  CryptoVerifier,
} from './payment-proof.js';
