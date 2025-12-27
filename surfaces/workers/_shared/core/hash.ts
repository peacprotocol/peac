/**
 * PEAC Shared Worker Core - Hashing Utilities
 *
 * Cryptographic hashing for replay detection.
 *
 * @packageDocumentation
 */

import type { ReplayContext } from './types.js';

/**
 * Hash a replay context to create a storage key.
 *
 * Uses SHA-256 to hash `issuer|keyid|nonce` to prevent storing
 * correlatable identifiers in external storage.
 *
 * Security: Never store raw nonces or keyids in replay stores.
 *
 * @param ctx - Replay context
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashReplayKey(ctx: ReplayContext): Promise<string> {
  const data = `${ctx.issuer}|${ctx.keyid}|${ctx.nonce}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
