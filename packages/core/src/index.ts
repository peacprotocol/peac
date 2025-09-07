/**
 * @peac/core v0.9.12 - Ultra-lean PEAC kernel
 * JWS(EdDSA) + key mgmt + precompiled validators
 */

// Primary exports
export { sign, signReceipt, signPurgeReceipt } from './sign.js';
export { verify, verifyReceipt, verifyBulk } from './verify.js';
export { vReceipt, vAIPref } from './validators.js';
export { VERSION_CONFIG } from './config.js';

// Types
export type { Rec, Pref, Kid, KeySet, SignOpts, VerifyResult, Receipt, PurgeReceipt } from './types.js';
