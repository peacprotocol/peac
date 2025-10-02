/**
 * @peac/core v0.9.14 - Receipt Engine with v0.9.14 wire format
 * typ: "peac.receipt/0.9", iat field, payment.scheme
 */

// v0.9.14 core functions
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

// v0.9.15 universal parser integration
export { discoverPolicy, discoverAndEnforce } from './discover.js';
export type { DiscoveryResult } from './discover.js';

// Core types and utilities
export type { Receipt, Kid, KeySet, VerifyKeySet } from './types.js';
export { canonicalPolicyHash, canonicalizeJson } from './hash.js';
export type { PolicyInputs } from './hash.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';
export { WIRE, PEAC_CANONICAL_ORIGIN, PROBLEM_BASE, WELL_KNOWN_PATHS } from './constants.js';

// Crypto utilities (for cross-runtime testing)
export { generateEdDSAKeyPair, signDetached, verifyDetached, validateKidFormat } from './crypto.js';
