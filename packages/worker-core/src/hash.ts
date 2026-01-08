/**
 * PEAC Worker Core - Hashing Utilities
 *
 * Cryptographic hashing for replay detection.
 *
 * SECURITY: Never store raw nonce tuples. All replay keys MUST be SHA-256 hashed
 * before storage to prevent information leakage if the replay store is compromised.
 *
 * @packageDocumentation
 */

import type { ReplayContext } from './types.js';

/**
 * Hash replay key components with SHA-256.
 *
 * SECURITY: Never store raw issuer:keyid:nonce tuples.
 * Hashing prevents information leakage if replay store is compromised.
 *
 * The hash is computed from: `issuer|keyid|nonce`
 *
 * @param ctx - Replay context with issuer, keyid, and nonce
 * @returns SHA-256 hash as hex string
 */
export async function hashReplayKey(ctx: ReplayContext): Promise<string> {
  const data = `${ctx.issuer}|${ctx.keyid}|${ctx.nonce}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a simple string with SHA-256.
 *
 * Utility function for hashing arbitrary strings.
 *
 * @param value - String to hash
 * @returns SHA-256 hash as hex string
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
