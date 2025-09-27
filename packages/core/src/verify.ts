/**
 * @peac/core v0.9.14 - JWS verification with typ: "peac.receipt/0.9"
 * Single PEAC-Receipt header, iat field validation
 */

import { jwtVerify, importJWK } from 'jose';
import { createHash } from 'node:crypto';
import { Receipt, KeySet, Kid } from './types.js';

export interface VerifyResult {
  header: { alg: 'EdDSA'; typ: 'peac.receipt/0.9'; kid: Kid };
  payload: Receipt;
  signature: string;
}

export async function verifyReceipt(jws: string, keys: KeySet): Promise<VerifyResult> {
  // Parse JWS header to get kid
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }

  const headerB64 = parts[0];
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

  // Validate header
  if (header.alg !== 'EdDSA') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  if (header.typ !== 'peac.receipt/0.9') {
    throw new Error(`Invalid type: expected peac.receipt/0.9, got ${header.typ}`);
  }

  if (!header.kid) {
    throw new Error('Missing kid in header');
  }

  // Get public key
  const keyData = keys[header.kid];
  if (!keyData) {
    throw new Error(`Unknown key ID: ${header.kid}`);
  }

  // Import public key
  const publicKey = await importJWK(keyData, 'EdDSA');

  // Verify JWS (skip exp check to handle our own 60s skew)
  const { payload, protectedHeader } = await jwtVerify(jws, publicKey, {
    algorithms: ['EdDSA'],
    requiredClaims: [], // Don't require exp claim validation
  });

  // Validate receipt structure
  if (!isReceipt(payload)) {
    throw new Error('Invalid receipt payload structure');
  }

  // Validate subject/hash integrity if resource provided
  if (payload.subject?.uri) {
    const expectedSub = computeResourceUrn(payload.subject.uri);
    if (payload.sub && payload.sub !== expectedSub) {
      throw new Error(`Subject mismatch: expected ${expectedSub}, got ${payload.sub}`);
    }
  }

  // Validate iat is reasonable (not in future, not too old)
  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now + 300) {
    // 5 minutes clock skew
    throw new Error(`Receipt issued in future: iat=${payload.iat}, now=${now}`);
  }
  if (payload.iat < now - 86400 * 365) {
    // 1 year old
    throw new Error(`Receipt too old: iat=${payload.iat}, now=${now}`);
  }

  // Validate payment requirements if http-402
  if (payload.enforcement?.method === 'http-402') {
    if (!payload.payment?.scheme || !payload.payment?.amount || !payload.payment?.currency) {
      throw new Error('HTTP-402 enforcement requires payment.scheme, amount, and currency');
    }
  }

  // harden: require kid in payload to match header
  const hdrKid = (protectedHeader as any)?.kid;
  const payKid = (payload as any)?.kid;
  if (!hdrKid || !payKid || hdrKid !== payKid) {
    throw new Error('Kid mismatch between header and payload');
  }

  // optional expiry check
  if (typeof (payload as any).exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if ((payload as any).exp <= now - 60) {
      // 60s skew
      throw new Error('Expired receipt');
    }
  }

  return {
    header: protectedHeader as VerifyResult['header'],
    payload,
    signature: parts[2],
  };
}

function computeResourceUrn(uri: string): string {
  // Normalize and hash the resource URI
  const normalized = new URL(uri).href; // Normalizes the URL
  const hash = createHash('sha256').update(normalized).digest('hex');
  return `urn:resource:${hash}`;
}

function isReceipt(x: unknown): x is Receipt {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    r.wire_version === '0.9' &&
    typeof r.iat === 'number' &&
    typeof r.kid === 'string' &&
    !!r.subject &&
    typeof (r.subject as any).uri === 'string' &&
    !!r.aipref &&
    typeof (r.aipref as any).status === 'string' &&
    typeof r.purpose === 'string'
  );
}
