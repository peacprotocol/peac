/**
 * @peac/core v0.9.13 - Receipt Engine with Core Primitives
 * Enforcement orchestration + PEIP-SAF + Ed25519 JWS + replay protection + UUIDv7
 */

// v0.9.13 receipt engine (main entry point)
export { enforce, discover, evaluate, settle, prove } from './enforce.js';
export type {
  DiscoveryContext,
  PolicySource,
  EvaluationContext,
  SettlementResult,
  EnforceResult,
  EnforceOptions,
} from './enforce.js';

// v0.9.12.4 core primitives
export { canonicalPolicyHash } from './hash.js';
export type { PolicyInputs } from './hash.js';
export {
  generateEdDSAKeyPair,
  signDetached,
  verifyDetached,
  publicKeyToJWKS,
  generateJWKS,
  importPrivateKey,
  importPublicKey,
  validateKidFormat,
} from './crypto.js';
export type { KeyPair, JWKSKey, DetachedJWS } from './crypto.js';
export type { KeyLike } from 'jose';
export { InMemoryNonceCache, isReplayAttack, preventReplay, isValidNonce } from './replay.js';
export type { NonceCache, NonceEntry } from './replay.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';
