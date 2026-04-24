/**
 * @peac/core - DEPRECATED. Removal scheduled for v0.13.0.
 *
 * This package is deprecated. Migrate to kernel-first packages:
 * - Constants: @peac/kernel
 * - Types and validation: @peac/schema
 * - Signing and verification: @peac/crypto
 * - Issue and verify: @peac/protocol
 *
 * See docs/MIGRATION_CURRENT.md for migration guide.
 *
 * @deprecated Use @peac/kernel, @peac/schema, @peac/crypto, @peac/protocol instead. Removal: v0.13.0.
 * @packageDocumentation
 */

// Re-export WIRE from kernel for backward compatibility
import { WIRE_VERSION } from '@peac/kernel';

/**
 * @deprecated Use WIRE_VERSION from @peac/kernel instead
 */
export const WIRE = WIRE_VERSION;

// Legacy exports - will be removed in v0.9.17
export { signReceipt, createAndSignReceipt } from './sign.js';
export type { SignOptions, SignReceiptOptions } from './sign.js';
export { verifyReceipt } from './verify.js';
export type { VerifyResult } from './verify.js';
export { enforce, discover, evaluate, settle, prove } from './enforce.js';
export type {
  DiscoveryContext,
  PolicySource,
  EvaluationContext,
  SettlementResult,
  EnforceResult,
  EnforceOptions,
} from './enforce.js';

// Core types and utilities
export type { Receipt, Kid, KeySet, VerifyKeySet } from './types.js';
export { canonicalPolicyHash } from './hash.js';
export type { PolicyInputs } from './hash.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';
export { PEAC_CANONICAL_ORIGIN, PROBLEM_BASE, WELL_KNOWN_PATHS } from './constants.js';

// Crypto utilities (for cross-runtime testing)
export { generateEdDSAKeyPair, signDetached, verifyDetached, validateKidFormat } from './crypto.js';
