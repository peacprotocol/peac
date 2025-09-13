/**
 * @peac/core v0.9.12 - Ultra-lean PEAC kernel
 * JWS(EdDSA) + key mgmt + precompiled validators
 */

// Primary exports
export { sign, signReceipt, signPurgeReceipt } from './sign.js';
export { verify, verifyReceipt, verifyBulk } from './verify.js';
export { vReceipt, vAIPref } from './validators.js';
export { VERSION_CONFIG, FEATURES, CLOUDFLARE_CONFIG } from './config.js';
export { PEAC_WIRE_VERSION, CANONICAL_HEADERS, LEGACY_HEADERS } from './constants.js';

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
export { InMemoryNonceCache, isReplayAttack, preventReplay, isValidNonce } from './replay.js';
export type { NonceCache, NonceEntry } from './replay.js';
export { uuidv7, isUUIDv7, extractTimestamp } from './ids/uuidv7.js';

// Types
export type {
  Rec,
  Pref,
  Kid,
  KeySet,
  SignOpts,
  VerifyResult,
  Receipt,
  PurgeReceipt,
} from './types.js';
