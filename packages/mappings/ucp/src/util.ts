/**
 * @peac/mappings-ucp - Shared utilities
 *
 * SHA-256 helpers used by verification and evidence generation. base64url
 * encoding and JCS canonicalization are reused from @peac/crypto directly at
 * the call sites (verify.ts / evidence.ts); these SHA-256 helpers stay local
 * and synchronous (node:crypto) pending the H3 sha256 sync/async consolidation.
 */

import { createHash } from 'node:crypto';

/**
 * SHA-256 hash as hex string.
 */
export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * SHA-256 hash as Uint8Array.
 */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}
