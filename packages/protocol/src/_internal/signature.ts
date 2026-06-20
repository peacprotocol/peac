/**
 * Internal Ed25519 signature-width guard for the verification paths.
 *
 * NOT re-exported from the package barrel (`index.ts` does
 * `export * from './verify'` / `'./verify-local'`, so anything exported from
 * those modules becomes public API). Keep this helper in `_internal` so the
 * guard adds no public surface.
 */

import { base64urlDecode } from '@peac/crypto';

/** Ed25519 signatures are fixed-width 64 bytes (RFC 8032 / RFC 8709). */
export const ED25519_SIGNATURE_BYTES = 64;

/**
 * Return the decoded byte length of a compact JWS signature segment, or `null`
 * when the token is not a well-formed three-part compact JWS or the signature
 * segment is not decodable base64url. Those `null` cases are deliberately left
 * to the existing format/verification error paths (this guard does not change
 * their classification); only a well-formed token whose signature decodes to a
 * non-64-byte width is surfaced to the caller as a wrong-length signature.
 */
export function ed25519SignatureByteLength(jws: string): number | null {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    return base64urlDecode(parts[2]).length;
  } catch {
    return null;
  }
}
