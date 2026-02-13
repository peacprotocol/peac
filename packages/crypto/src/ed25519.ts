/**
 * Internal Ed25519 wrapper -- async-only surface
 *
 * PEAC uses ONLY the async methods from @noble/ed25519.
 * In noble v3, sync methods require explicit hash configuration.
 * Async methods use built-in Web Crypto and need no configuration.
 *
 * This module re-exports only the async surface to prevent accidental
 * sync usage. All other modules in @peac/crypto MUST import from
 * this file, never directly from '@noble/ed25519'.
 *
 * Key material handling:
 * - Private keys are 32-byte Uint8Array (Ed25519 seed)
 * - Public keys are 32-byte Uint8Array (compressed Ed25519 point)
 * - JavaScript cannot guarantee memory zeroization; callers should
 *   avoid storing keys longer than necessary and never log key bytes
 * - randomSecretKey() uses crypto.getRandomValues() (CSPRNG)
 *   which is available in Node.js >=15 and all modern runtimes
 */

import {
  signAsync,
  verifyAsync,
  getPublicKeyAsync,
  utils,
} from '@noble/ed25519';

/** Sign a message with Ed25519 (async, Web Crypto backed) */
export const sign = signAsync;

/** Verify an Ed25519 signature (async, Web Crypto backed) */
export const verify = verifyAsync;

/** Derive public key from private key (async, Web Crypto backed) */
export const getPublicKey = getPublicKeyAsync;

/** Generate a cryptographically random 32-byte secret key (CSPRNG) */
export const randomSecretKey = utils.randomSecretKey;
