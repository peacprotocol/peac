/**
 * Cryptographic hash utilities
 *
 * Platform-agnostic SHA-256 implementation that works in Node.js, browser, and edge runtimes.
 * Uses Web Crypto API with Node.js crypto fallback.
 *
 * @packageDocumentation
 */

import { base64urlDecode, base64urlEncode } from './base64url.js';

/**
 * Compute SHA-256 hash of data and return as lowercase hex string
 *
 * Uses Web Crypto API if available, falls back to Node.js crypto.
 *
 * @param data - Data to hash (Uint8Array or string)
 * @returns Lowercase hex string (64 characters)
 */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  // Try Web Crypto API first (works in browser, edge, and Node 20+)
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback to Node.js crypto
  try {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256');
    hash.update(bytes);
    return hash.digest('hex');
  } catch {
    throw new Error('No SHA-256 implementation available. Ensure Web Crypto API or Node.js crypto is available.');
  }
}

/**
 * Compute SHA-256 hash of data and return as Uint8Array (32 bytes)
 *
 * @param data - Data to hash (Uint8Array or string)
 * @returns Hash as Uint8Array (32 bytes)
 */
export async function sha256Bytes(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  // Try Web Crypto API first
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(hashBuffer);
  }

  // Fallback to Node.js crypto
  try {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256');
    hash.update(bytes);
    return new Uint8Array(hash.digest());
  } catch {
    throw new Error('No SHA-256 implementation available.');
  }
}

/**
 * Convert hex string to Uint8Array
 *
 * @param hex - Lowercase hex string
 * @returns Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  // Validate: must be even length and contain only hex characters
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string');
  }
  if (hex.length === 0) {
    return new Uint8Array([]);
  }
  const matches = hex.match(/.{2}/g);
  if (!matches) {
    throw new Error('Invalid hex string');
  }
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

/**
 * Convert Uint8Array to lowercase hex string
 *
 * @param bytes - Byte array
 * @returns Lowercase hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * JWK structure for Ed25519 public keys (minimal required fields for thumbprint)
 */
export interface JWKThumbprintInput {
  /** Key type - must be "OKP" for Ed25519 */
  kty: string;
  /** Curve - must be "Ed25519" */
  crv: string;
  /** Public key (base64url) */
  x: string;
}

/**
 * Compute RFC 7638 JWK Thumbprint (base64url, SHA-256)
 *
 * For Ed25519 keys, the canonical JSON is: {"crv":"Ed25519","kty":"OKP","x":"<base64url>"}
 * Returns base64url-encoded SHA-256 hash (43 characters).
 *
 * @param jwk - JWK with kty, crv, x fields
 * @returns Base64url-encoded SHA-256 thumbprint (43 characters)
 */
export async function computeJwkThumbprint(jwk: JWKThumbprintInput): Promise<string> {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new Error('Only Ed25519 keys (OKP/Ed25519) are supported for thumbprint computation');
  }

  // Canonical JSON per RFC 7638 (alphabetically sorted members, no whitespace)
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
  });

  const hashBytes = await sha256Bytes(canonical);
  return base64urlEncode(hashBytes);
}

/**
 * Convert JWK to Ed25519 public key bytes (32 bytes)
 *
 * @param jwk - JWK with kty, crv, x fields
 * @returns Public key as 32-byte Uint8Array
 */
export function jwkToPublicKeyBytes(jwk: JWKThumbprintInput): Uint8Array {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new Error('Only Ed25519 keys (OKP/Ed25519) are supported');
  }

  const xBytes = base64urlDecode(jwk.x);
  if (xBytes.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${xBytes.length}`);
  }

  return xBytes;
}
