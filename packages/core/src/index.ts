/**
 * @peac/core v0.9.12 - Ultra-lean PEAC kernel
 * JWS(EdDSA) + key mgmt + precompiled validators
 */

// Primary exports
export { sign } from './sign.js';
export { verify } from './verify.js';
export { vReceipt, vAIPref } from './validators.js';

// Types
export type { Rec, Pref, Kid, KeySet, SignOpts, VerifyResult } from './types.js';