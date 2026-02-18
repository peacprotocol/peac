/**
 * JWKS file loader for verifier-side key resolution
 *
 * Loads a local JWKS JSON file, filters for Ed25519 keys,
 * and provides kid-based lookup.
 */

import { readFile } from 'node:fs/promises';
import { base64urlDecode } from '@peac/crypto';
import { JwksLoadError } from './errors.js';

export interface JwksKeyEntry {
  kid: string;
  publicKey: Uint8Array;
}

export async function loadJwksFile(filePath: string): Promise<JwksKeyEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new JwksLoadError(
      `Failed to read JWKS file: ${filePath} -- ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JwksLoadError(`JWKS file is not valid JSON: ${filePath}`);
  }

  if (typeof parsed !== 'object' || parsed === null || !('keys' in parsed)) {
    throw new JwksLoadError('JWKS must contain a "keys" array');
  }

  const jwks = parsed as { keys: unknown[] };
  if (!Array.isArray(jwks.keys)) {
    throw new JwksLoadError('JWKS "keys" must be an array');
  }

  const entries: JwksKeyEntry[] = [];
  for (const key of jwks.keys) {
    if (typeof key !== 'object' || key === null) continue;
    const k = key as Record<string, unknown>;

    // Filter for Ed25519 only (reject non-EdDSA alg values)
    if (k.kty !== 'OKP' || k.crv !== 'Ed25519') continue;
    if (typeof k.x !== 'string') continue;
    if (k.alg !== undefined && k.alg !== 'EdDSA') continue;

    const kid = typeof k.kid === 'string' ? k.kid : `key-${entries.length}`;
    try {
      const publicKey = base64urlDecode(k.x);
      if (publicKey.length === 32) {
        entries.push({ kid, publicKey });
      }
    } catch {
      // Skip keys with invalid base64url encoding
    }
  }

  return entries;
}

export function resolveKeyByKid(keys: JwksKeyEntry[], kid: string): Uint8Array | undefined {
  const entry = keys.find((k) => k.kid === kid);
  return entry?.publicKey;
}
