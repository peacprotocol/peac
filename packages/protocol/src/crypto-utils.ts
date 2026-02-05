/**
 * Cryptographic utilities for PEAC verifiers
 *
 * @deprecated Use @peac/crypto directly instead. This re-export exists for backwards compatibility.
 *
 * @packageDocumentation
 */

// Re-export all crypto utilities from @peac/crypto for backwards compatibility
export {
  base64urlDecode,
  base64urlEncode,
  bytesToHex,
  computeJwkThumbprint,
  hexToBytes,
  jwkToPublicKeyBytes,
  sha256Bytes,
  sha256Hex,
} from '@peac/crypto';
