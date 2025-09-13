/**
 * @peac/core v0.9.12.4 - Core primitives for PEIP-SAF implementation
 * Canonical policy hashing + Ed25519 JWS + replay protection + UUIDv7
 */

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
} from './crypto.js';
export type { KeyPair, JWKSKey, DetachedJWS } from './crypto.js';
export type { KeyLike } from 'jose';
export { InMemoryNonceCache, isReplayAttack, preventReplay, isValidNonce } from './replay.js';
export type { NonceCache, NonceEntry } from './replay.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';
