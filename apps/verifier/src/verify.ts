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

export type VerifyStatus = 'valid' | 'invalid' | 'error' | 'no-key' | 'unsupported-runtime';

export interface VerifyResult {
  status: VerifyStatus;
  message: string;
  claims?: Record<string, unknown>;
  kid?: string;
}

const UNSUPPORTED_RUNTIME_MESSAGE =
  'This browser does not support Ed25519 WebCrypto verification. ' +
  'Use a current browser, or verify with the PEAC CLI.';

// RFC 8032 Section 7.1 Test 1: a known-good Ed25519 triple (empty message). The
// probe verifies this exact vector so it proves the runtime can perform Ed25519
// verification, not merely import a raw key.
const RFC8032_VECTOR1_PUBLIC_KEY =
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const RFC8032_VECTOR1_SIGNATURE =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

function hexToBytes(hexStr: string): Uint8Array {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Probe whether this runtime can verify Ed25519 via WebCrypto by importing a
 * known-good RFC 8032 public key and verifying its known-good signature. Returns
 * true only when verification of the known-good vector returns true. PEAC
 * verification fails closed on an unsupported runtime; detecting it up front lets
 * the UI tell the user their runtime is the problem rather than reporting the
 * receipt as invalid.
 */
export async function ed25519WebCryptoSupported(): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  try {
    const key = await subtle.importKey(
      'raw',
      hexToBytes(RFC8032_VECTOR1_PUBLIC_KEY) as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    // Empty message, known-good signature -> must verify true on a supporting runtime.
    return await subtle.verify(
      { name: 'Ed25519' },
      key,
      hexToBytes(RFC8032_VECTOR1_SIGNATURE) as BufferSource,
      new Uint8Array(0) as BufferSource
    );
  } catch {
    // NotSupportedError (algorithm unavailable) or any failure verifying the
    // known-good vector means this runtime cannot verify Ed25519.
    return false;
  }
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

  // Fail closed on an unsupported runtime, and say so clearly: a runtime that
  // cannot do Ed25519 WebCrypto is not the same as an invalid receipt.
  if (!(await ed25519WebCryptoSupported())) {
    return {
      status: 'unsupported-runtime',
      message: UNSUPPORTED_RUNTIME_MESSAGE,
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
    // Unsupported-runtime is handled by the ed25519WebCryptoSupported() gate
    // above; verifyLocal() maps any internal verifier error to a result code, so
    // this catch only sees unexpected pre-verification errors.
    return {
      status: 'error',
      message: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
      claims: decoded.payload,
      kid,
    };
  }
}
