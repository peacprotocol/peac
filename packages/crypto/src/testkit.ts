/**
 * PEAC Crypto Test Kit
 *
 * This module contains utilities for TEST FIXTURES ONLY.
 * These functions are NOT exported from the main entry point.
 *
 * Import path: @peac/crypto/testkit
 *
 * SECURITY: Never use these in production. Production bundlers can
 * tree-shake this module away since it's a separate export path.
 */

import { getPublicKey } from './ed25519.js';
import { CryptoError } from './errors.js';

/**
 * Generate an Ed25519 keypair from a deterministic seed.
 *
 * WARNING: FOR TEST FIXTURES ONLY. DO NOT USE IN PRODUCTION.
 * Production code should use generateKeypair() which uses cryptographically
 * secure random bytes. Seeded keys are predictable and compromise security.
 *
 * This function is intentionally in a separate module (@peac/crypto/testkit)
 * so that production bundlers can tree-shake it away.
 *
 * @param seed - 32-byte seed (e.g., SHA-256 hash of a known string)
 * @returns Private key (32 bytes) and public key (32 bytes)
 *
 * @example
 * ```ts
 * // Use only in test fixtures for reproducibility
 * import { generateKeypairFromSeed } from '@peac/crypto/testkit';
 *
 * const seed = sha256('peac-test-key-001');
 * const { privateKey, publicKey } = await generateKeypairFromSeed(seed);
 * ```
 */
export async function generateKeypairFromSeed(seed: Uint8Array): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  if (seed.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_SEED_LENGTH', 'Ed25519 seed must be 32 bytes');
  }

  // In Ed25519, the private key IS the seed (32 bytes)
  // The public key is derived from it
  const privateKey = seed;
  const publicKey = await getPublicKey(privateKey);

  return { privateKey, publicKey };
}
