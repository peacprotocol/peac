/**
 * @peac/core crypto utilities
 */

import { generateKeyPair, exportJWK } from 'jose';
import type { KeyLike } from 'jose';

export async function generateEdDSAKeyPair(): Promise<{
  publicKey: KeyLike;
  privateKey: KeyLike;
  kid: string;
}> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const jwk = await exportJWK(publicKey);
  // kid format used in the cross-runtime test
  const kid = `ed25519:${jwk.x}`;
  return { publicKey, privateKey, kid };
}

// Cross-runtime crypto functions for testing
export async function signDetached(
  payload: string,
  privateKey: KeyLike,
  kid: string
): Promise<string> {
  const { SignJWT } = await import('jose');

  // Create a minimal JWS with the payload as the 'data' field
  const jwt = await new SignJWT({ data: payload })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuedAt()
    .sign(privateKey);

  return jwt;
}

export async function verifyDetached(
  payload: string,
  jws: string,
  publicKey: KeyLike
): Promise<boolean> {
  try {
    const { jwtVerify } = await import('jose');
    const { payload: decoded } = await jwtVerify(jws, publicKey);
    return decoded.data === payload;
  } catch {
    return false;
  }
}

export function validateKidFormat(kid: string): boolean {
  return typeof kid === 'string' && kid.length > 0;
}
