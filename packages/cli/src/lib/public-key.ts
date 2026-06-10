/**
 * Public verification key loader for offline `peac verify --public-key`.
 *
 * Accepts either a bare public Ed25519 JWK or a single-key JWKS
 * (`{ "keys": [jwk] }`). Fails closed: rejects private key material, empty or
 * multi-key JWKS, non-Ed25519 keys, and malformed input. Error messages are
 * user-safe and never echo key material.
 *
 * Conversion and the base64url / 32-byte length check reuse the canonical
 * `jwkToPublicKeyBytes()` from `@peac/crypto`; this module only handles file
 * shape, container selection, and the private-key guard.
 */

import { jwkToPublicKeyBytes } from '@peac/crypto';

/**
 * Parse the contents of a public-key file into raw Ed25519 public key bytes.
 *
 * @param content - UTF-8 contents of the public-key file (bare JWK or single-key JWKS).
 * @returns The 32-byte Ed25519 public key.
 * @throws Error with a user-safe message on any invalid / unsupported input.
 */
export function parsePublicKey(content: string): Uint8Array {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('public key file is not valid JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('public key file must be a JWK or single-key JWKS object');
  }

  const obj = parsed as Record<string, unknown>;

  // Single-key JWKS container: { keys: [ jwk ] }.
  let jwk: Record<string, unknown>;
  if ('keys' in obj) {
    const keys = obj.keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('JWKS contains no keys');
    }
    if (keys.length > 1) {
      throw new Error(
        'JWKS contains multiple keys; a single-key JWKS is required (multi-key JWKS is not supported)'
      );
    }
    const first = keys[0];
    if (first === null || typeof first !== 'object' || Array.isArray(first)) {
      throw new Error('JWKS key entry is not a JWK object');
    }
    jwk = first as Record<string, unknown>;
  } else {
    jwk = obj;
  }

  if ('d' in jwk) {
    throw new Error('public key required: the file contains private key material');
  }

  const { kty, crv, x } = jwk as { kty?: unknown; crv?: unknown; x?: unknown };
  if (kty !== 'OKP' || crv !== 'Ed25519') {
    throw new Error('unsupported key: expected a public Ed25519 JWK (kty "OKP", crv "Ed25519")');
  }
  if (typeof x !== 'string' || x.length === 0) {
    throw new Error('invalid JWK: missing public key value "x"');
  }

  try {
    return jwkToPublicKeyBytes({ kty: 'OKP', crv: 'Ed25519', x });
  } catch {
    // jwkToPublicKeyBytes throws on bad base64url or wrong length.
    throw new Error('invalid JWK: "x" is not a 32-byte base64url Ed25519 public key');
  }
}
