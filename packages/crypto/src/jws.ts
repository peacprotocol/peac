/**
 * JWS compact serialization with Ed25519 (RFC 8032)
 * Implements peac-receipt/0.1 wire format
 */

import * as ed25519 from '@noble/ed25519';
import { PEAC_WIRE_TYP, PEAC_ALG } from '@peac/schema';
import {
  base64urlEncode,
  base64urlDecode,
  base64urlEncodeString,
  base64urlDecodeString,
} from './base64url';
import { CryptoError } from './errors';

/**
 * JWS header for PEAC receipts
 */
export interface JWSHeader {
  typ: typeof PEAC_WIRE_TYP;
  alg: typeof PEAC_ALG;
  kid: string;
}

/**
 * Result of JWS verification
 */
export interface VerifyResult<T = unknown> {
  header: JWSHeader;
  payload: T;
  valid: boolean;
}

/**
 * Sign a payload with Ed25519 and return JWS compact serialization
 *
 * @param payload - JSON-serializable payload
 * @param privateKey - Ed25519 private key (32 bytes)
 * @param kid - Key ID (ISO 8601 timestamp)
 * @returns JWS compact serialization (header.payload.signature)
 */
export async function sign(payload: unknown, privateKey: Uint8Array, kid: string): Promise<string> {
  if (privateKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 private key must be 32 bytes');
  }

  // Create header
  const header: JWSHeader = {
    typ: PEAC_WIRE_TYP,
    alg: PEAC_ALG,
    kid,
  };

  // Encode header and payload
  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));

  // Create signing input
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  // Sign with Ed25519
  const signatureBytes = await ed25519.signAsync(signingInputBytes, privateKey);

  // Encode signature
  const signatureB64 = base64urlEncode(signatureBytes);

  // Return JWS compact serialization
  return `${signingInput}.${signatureB64}`;
}

/**
 * Verify a JWS compact serialization with Ed25519
 *
 * @param jws - JWS compact serialization
 * @param publicKey - Ed25519 public key (32 bytes)
 * @returns Verification result with decoded header and payload
 */
export async function verify<T = unknown>(
  jws: string,
  publicKey: Uint8Array
): Promise<VerifyResult<T>> {
  if (publicKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 public key must be 32 bytes');
  }

  // Split JWS
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new CryptoError(
      'CRYPTO_INVALID_JWS_FORMAT',
      'Invalid JWS: must have three dot-separated parts'
    );
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Decode header
  const headerJson = base64urlDecodeString(headerB64);
  const header = JSON.parse(headerJson) as JWSHeader;

  // Validate header
  if (header.typ !== PEAC_WIRE_TYP) {
    throw new CryptoError(
      'CRYPTO_INVALID_TYP',
      `Invalid typ: expected ${PEAC_WIRE_TYP}, got ${header.typ}`
    );
  }
  if (header.alg !== PEAC_ALG) {
    throw new CryptoError(
      'CRYPTO_INVALID_ALG',
      `Invalid alg: expected ${PEAC_ALG}, got ${header.alg}`
    );
  }

  // Decode payload
  const payloadJson = base64urlDecodeString(payloadB64);
  const payload = JSON.parse(payloadJson) as T;

  // Decode signature
  const signatureBytes = base64urlDecode(signatureB64);

  // Verify signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  const valid = await ed25519.verifyAsync(signatureBytes, signingInputBytes, publicKey);

  return {
    header,
    payload,
    valid,
  };
}

/**
 * Decode JWS without verifying signature (use with caution!)
 *
 * @param jws - JWS compact serialization
 * @returns Decoded header and payload (unverified)
 */
export function decode<T = unknown>(jws: string): { header: JWSHeader; payload: T } {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new CryptoError(
      'CRYPTO_INVALID_JWS_FORMAT',
      'Invalid JWS: must have three dot-separated parts'
    );
  }

  const [headerB64, payloadB64] = parts;

  const headerJson = base64urlDecodeString(headerB64);
  const header = JSON.parse(headerJson) as JWSHeader;

  const payloadJson = base64urlDecodeString(payloadB64);
  const payload = JSON.parse(payloadJson) as T;

  return { header, payload };
}

/**
 * Generate a random Ed25519 keypair
 *
 * @returns Private key (32 bytes) and public key (32 bytes)
 */
export async function generateKeypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);

  return { privateKey, publicKey };
}

// NOTE: generateKeypairFromSeed has been moved to @peac/crypto/testkit
// It's intentionally NOT exported from the main module to prevent accidental
// use in production. Use: import { generateKeypairFromSeed } from '@peac/crypto/testkit'

/**
 * Ed25519 JWK interface for private keys
 */
export interface Ed25519PrivateJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  /** Public key (base64url encoded, 32 bytes) */
  x: string;
  /** Private key (base64url encoded, 32 bytes) */
  d: string;
}

/**
 * Derive the Ed25519 public key from a private key
 *
 * @param privateKey - Ed25519 private key (32 bytes)
 * @returns Public key (32 bytes)
 */
export async function derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  if (privateKey.length !== 32) {
    throw new CryptoError('CRYPTO_INVALID_KEY_LENGTH', 'Ed25519 private key must be 32 bytes');
  }
  return ed25519.getPublicKeyAsync(privateKey);
}

/**
 * Validate that an Ed25519 JWK has a consistent keypair
 *
 * Derives the public key from the private key (d) and verifies it matches
 * the declared public key (x). This catches configuration errors where
 * the wrong key components are paired.
 *
 * @param jwk - Ed25519 JWK with both public (x) and private (d) components
 * @returns true if the keypair is consistent, false otherwise
 *
 * @example
 * ```typescript
 * const jwk = {
 *   kty: 'OKP',
 *   crv: 'Ed25519',
 *   x: 'base64url-encoded-public-key',
 *   d: 'base64url-encoded-private-key',
 * };
 *
 * if (!await validateKeypair(jwk)) {
 *   throw new Error('Invalid keypair: d does not derive to x');
 * }
 * ```
 */
export async function validateKeypair(jwk: Ed25519PrivateJwk): Promise<boolean> {
  // Validate JWK structure
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    return false;
  }

  // Decode the keys
  let privateKeyBytes: Uint8Array;
  let declaredPublicKeyBytes: Uint8Array;

  try {
    privateKeyBytes = base64urlDecode(jwk.d);
    declaredPublicKeyBytes = base64urlDecode(jwk.x);
  } catch {
    return false;
  }

  // Validate lengths
  if (privateKeyBytes.length !== 32 || declaredPublicKeyBytes.length !== 32) {
    return false;
  }

  // Derive the actual public key from the private key
  const derivedPublicKeyBytes = await ed25519.getPublicKeyAsync(privateKeyBytes);

  // Compare derived public key with declared public key
  if (derivedPublicKeyBytes.length !== declaredPublicKeyBytes.length) {
    return false;
  }

  for (let i = 0; i < derivedPublicKeyBytes.length; i++) {
    if (derivedPublicKeyBytes[i] !== declaredPublicKeyBytes[i]) {
      return false;
    }
  }

  return true;
}
