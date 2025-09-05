/**
 * @peac/core/sign - Ultra-lean JWS signing (EdDSA)
 * Target: <10ms p95
 */

import { SignJWT, importJWK } from 'jose';
import { vReceipt } from './validators.js';
import type { Rec, SignOpts } from './types.js';

export async function sign(payload: Rec, opts: SignOpts): Promise<string> {
  // Validate receipt schema (precompiled for speed)
  vReceipt(payload);

  // Kid consistency check
  if (payload.kid !== opts.kid) {
    throw new Error(`Receipt kid mismatch: ${payload.kid} !== ${opts.kid}`);
  }

  // Import private key (EdDSA/Ed25519)
  const privateKey = await importJWK(opts.privateKey, 'EdDSA');

  // Create compact JWS
  const jwt = await new SignJWT(payload as any)
    .setProtectedHeader({
      alg: 'EdDSA',
      kid: opts.kid,
      typ: 'peac+jws',
    })
    .sign(privateKey);

  return jwt;
}
