/**
 * @peac/core/verify - Ultra-lean JWS verification
 * Target: <5ms p95
 */

import { jwtVerify, importJWK } from 'jose';
import { vReceipt } from './validators.js';
import type { KeySet, VerifyResult } from './types.js';

export async function verify(jws: string, keys: KeySet): Promise<VerifyResult> {
  // Parse header to get kid (without verification)
  const [headerB64] = jws.split('.');
  if (!headerB64) throw new Error('Invalid JWS format');

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

  // Validate header
  if (header.alg !== 'EdDSA') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  if (!header.kid || typeof header.kid !== 'string') {
    throw new Error('Missing or invalid kid in header');
  }

  // Get public key
  const keyData = keys[header.kid];
  if (!keyData) {
    throw new Error(`Unknown key ID: ${header.kid}`);
  }

  // Import public key
  const publicKey = await importJWK(keyData, 'EdDSA');

  // Verify signature and decode payload
  const { payload, protectedHeader } = await jwtVerify(jws, publicKey, {
    algorithms: ['EdDSA'],
  });

  // Validate receipt schema (precompiled)
  vReceipt(payload);

  // Ensure kid consistency
  if (payload.kid !== header.kid) {
    throw new Error(`Kid mismatch: header=${header.kid}, payload=${payload.kid}`);
  }

  return {
    hdr: protectedHeader as any,
    obj: payload as any,
  };
}
