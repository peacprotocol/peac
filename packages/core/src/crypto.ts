/**
 * Ed25519 cryptographic operations for PEAC receipts
 * Uses jose library for RFC 7515/7797 compliance
 */

import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportSPKI,
  generateKeyPair,
  FlattenedSign,
  flattenedVerify,
  type KeyLike,
} from 'jose';
import { uuidv7 } from './ids/uuidv7.js';

export interface KeyPair {
  privateKey: KeyLike;
  publicKey: KeyLike;
  kid: string;
}

export interface JWKSKey {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
  alg: 'EdDSA';
  use: 'sig';
}

export interface DetachedJWS {
  protected: string;
  signature: string;
}

/**
 * Generate Ed25519 key pair with rotating kid format YYYY-MM-DD/nn
 */
export async function generateEdDSAKeyPair(): Promise<KeyPair> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const kid = generateRotatingKid();

  return {
    privateKey,
    publicKey,
    kid,
  };
}

/**
 * Generate rotating kid format: YYYY-MM-DD/nn
 */
function generateRotatingKid(): string {
  const now = new Date();
  const date = now.toISOString().substring(0, 10); // YYYY-MM-DD
  const nn = String(Math.floor(now.getTime() / 1000) % 100).padStart(2, '0');
  return `${date}/${nn}`;
}

/**
 * Validate kid format: YYYY-MM-DD/nn
 */
export function validateKidFormat(kid: string): boolean {
  const kidRegex = /^\d{4}-\d{2}-\d{2}\/\d{2}$/;
  return kidRegex.test(kid);
}

/**
 * Create detached JWS signature per RFC 7797
 * b64: false, crit: ["b64"], alg: EdDSA
 */
export async function signDetached(
  payload: Uint8Array | string,
  privateKey: KeyLike,
  kid: string
): Promise<DetachedJWS> {
  if (!validateKidFormat(kid)) {
    throw new Error(`Invalid kid format: ${kid}. Expected format: YYYY-MM-DD/nn`);
  }

  const payloadBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

  // Use FlattenedSign for detached payload (RFC 7797)
  const jws = await new FlattenedSign(payloadBytes)
    .setProtectedHeader({
      alg: 'EdDSA',
      b64: false,
      crit: ['b64'],
      kid,
    })
    .sign(privateKey);

  return {
    protected: jws.protected!,
    signature: jws.signature,
  };
}

/**
 * Verify detached JWS signature
 */
export async function verifyDetached(
  payload: Uint8Array | string,
  detachedJws: DetachedJWS,
  publicKey: KeyLike
): Promise<boolean> {
  try {
    const payloadBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

    // For b64=false detached JWS verification, we need to reconstruct the JWS
    // with the raw payload (not base64url encoded) as the payload field
    await flattenedVerify(
      {
        protected: detachedJws.protected,
        signature: detachedJws.signature,
        payload: new TextDecoder().decode(payloadBytes), // Raw payload for b64=false
      },
      publicKey,
      {
        algorithms: ['EdDSA'],
      }
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Convert public key to JWKS format
 */
export async function publicKeyToJWKS(publicKey: KeyLike, kid: string): Promise<JWKSKey> {
  if (!validateKidFormat(kid)) {
    throw new Error(`Invalid kid format: ${kid}. Expected format: YYYY-MM-DD/nn`);
  }

  const spki = await exportSPKI(publicKey);

  // Extract x coordinate from Ed25519 public key
  const keyData = Buffer.from(
    spki.replace(/-----BEGIN PUBLIC KEY-----|\-----END PUBLIC KEY-----|\s/g, ''),
    'base64'
  );
  const x = keyData.subarray(-32).toString('base64url');

  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  };
}

/**
 * Generate JWKS document
 */
export async function generateJWKS(keyPairs: KeyPair[]): Promise<{ keys: JWKSKey[] }> {
  const keys: JWKSKey[] = [];

  for (const keyPair of keyPairs) {
    const jwk = await publicKeyToJWKS(keyPair.publicKey, keyPair.kid);
    keys.push(jwk);
  }

  // Sort keys by kid for deterministic output
  keys.sort((a, b) => a.kid.localeCompare(b.kid));

  return { keys };
}

/**
 * Import private key from PKCS8 PEM
 */
export async function importPrivateKey(pkcs8Pem: string): Promise<KeyLike> {
  return importPKCS8(pkcs8Pem, 'EdDSA');
}

/**
 * Import public key from SPKI PEM
 */
export async function importPublicKey(spkiPem: string): Promise<KeyLike> {
  return importSPKI(spkiPem, 'EdDSA');
}
