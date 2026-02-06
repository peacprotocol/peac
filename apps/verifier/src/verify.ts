/**
 * Verification Module
 *
 * Wraps verifyLocal() from @peac/protocol for browser use.
 * All verification happens client-side -- no server calls.
 */

import { verifyLocal } from '@peac/protocol/verify-local';
import { base64urlDecode } from '@peac/crypto';
import { findKeyForKid } from './lib/trust-store.js';
import { decodeReceipt } from './lib/decode-receipt.js';

export type VerifyStatus = 'valid' | 'invalid' | 'error' | 'no-key';

export interface VerifyResult {
  status: VerifyStatus;
  message: string;
  claims?: Record<string, unknown>;
  kid?: string;
}

export async function verifyReceipt(jws: string): Promise<VerifyResult> {
  const decoded = decodeReceipt(jws);
  if (!decoded) {
    return { status: 'error', message: 'Invalid JWS format -- expected 3 dot-separated parts' };
  }

  const kid = decoded.header.kid;
  if (!kid) {
    return { status: 'error', message: 'Missing kid in JWS header' };
  }

  const trustedKey = findKeyForKid(kid);
  if (!trustedKey) {
    return {
      status: 'no-key',
      message: `No trusted key found for kid "${kid}". Add the issuer's public key first.`,
      claims: decoded.payload,
      kid,
    };
  }

  try {
    const publicKeyBytes = base64urlDecode(trustedKey.x);
    const result = await verifyLocal(jws, publicKeyBytes);

    if (result.valid) {
      return {
        status: 'valid',
        message: 'Signature valid, claims verified',
        claims: result.claims as unknown as Record<string, unknown>,
        kid,
      };
    }

    return {
      status: 'invalid',
      message: `${result.code}: ${result.message}`,
      claims: decoded.payload,
      kid,
    };
  } catch (err) {
    return {
      status: 'error',
      message: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      claims: decoded.payload,
      kid,
    };
  }
}
