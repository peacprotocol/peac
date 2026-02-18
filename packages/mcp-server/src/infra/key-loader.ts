/**
 * Issuer key loader (DD-52: no ambient key discovery)
 *
 * Supports `env:VAR_NAME` and `file:/path` schemes.
 * Reads JWK JSON, validates Ed25519, derives public key.
 * NEVER logs key bytes.
 */

import { readFile } from 'node:fs/promises';
import {
  base64urlDecode,
  base64urlEncode,
  derivePublicKey,
  validateKeypair,
  sha256Hex,
} from '@peac/crypto';
import type { Ed25519PrivateJwk } from '@peac/crypto';
import { KeyLoadError } from './errors.js';

export interface LoadedKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  kid: string;
}

export async function loadIssuerKey(schemeUri: string): Promise<LoadedKey> {
  let raw: string;

  if (schemeUri.startsWith('env:')) {
    const varName = schemeUri.slice(4);
    const envValue = process.env[varName];
    if (!envValue) {
      throw new KeyLoadError(`Environment variable ${varName} is not set or empty`);
    }
    raw = envValue;
  } else if (schemeUri.startsWith('file:')) {
    const filePath = schemeUri.slice(5);
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new KeyLoadError(
        `Failed to read key file: ${filePath} -- ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    throw new KeyLoadError(
      `Unsupported key scheme: ${schemeUri} (expected env:VAR_NAME or file:/path)`
    );
  }

  let jwk: unknown;
  try {
    jwk = JSON.parse(raw);
  } catch {
    throw new KeyLoadError('Key data is not valid JSON');
  }

  // Validate JWK structure
  if (
    typeof jwk !== 'object' ||
    jwk === null ||
    !('kty' in jwk) ||
    !('crv' in jwk) ||
    !('d' in jwk)
  ) {
    throw new KeyLoadError('JWK must contain kty, crv, and d fields');
  }

  const j = jwk as Record<string, unknown>;
  if (j.kty !== 'OKP' || j.crv !== 'Ed25519') {
    throw new KeyLoadError(
      `JWK must be Ed25519 (kty: OKP, crv: Ed25519), got kty=${String(j.kty)} crv=${String(j.crv)}`
    );
  }

  if (typeof j.d !== 'string' || typeof j.x !== 'string') {
    throw new KeyLoadError('JWK d and x fields must be base64url strings');
  }

  const ed25519Jwk: Ed25519PrivateJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: j.x as string,
    d: j.d as string,
  };

  // Validate keypair consistency
  const valid = await validateKeypair(ed25519Jwk);
  if (!valid) {
    throw new KeyLoadError('JWK keypair validation failed: d does not derive to x');
  }

  const privateKey = base64urlDecode(ed25519Jwk.d);
  const publicKey = await derivePublicKey(privateKey);

  // Extract kid. Falls back to a deterministic derivation from the public key
  // (truncated SHA-256 of base64url-encoded public key) so runs are reproducible.
  let kid: string;
  if (typeof j.kid === 'string') {
    kid = j.kid;
  } else {
    const pubB64 = base64urlEncode(publicKey);
    const hash = await sha256Hex(pubB64);
    kid = hash.slice(0, 16);
  }

  return { privateKey, publicKey, kid };
}
