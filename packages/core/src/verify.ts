/**
 * @peac/core v0.9.14 - JWS verification with typ: "peac.receipt/0.9"
 * Single PEAC-Receipt header, iat field validation
 */

import { jwtVerify, importJWK } from 'jose';
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

  // Verify JWS
  const { payload, protectedHeader } = await jwtVerify(jws, publicKey, {
    algorithms: ['EdDSA'],
  });

  // Validate receipt structure
  if (!isReceipt(payload)) {
    throw new Error('Invalid receipt payload structure');
  }

  return {
    header: protectedHeader as VerifyResult['header'],
    payload,
    signature: parts[2],
  };
}

function isReceipt(x: unknown): x is Receipt {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    r.version === '0.9.14' &&
    r.wire_version === '0.9' &&
    typeof r.iat === 'number' &&
    typeof r.kid === 'string' &&
    !!r.subject &&
    typeof (r.subject as any).uri === 'string' &&
    !!r.aipref &&
    typeof (r.aipref as any).status === 'string'
  );
}

function validateReceiptStructure(receipt: Receipt): void {
  // Validate required fields
  if (!receipt.version || receipt.version !== '0.9.14') {
    throw new Error(`Invalid version: expected 0.9.14, got ${receipt.version}`);
  }

  if (!receipt.wire_version || receipt.wire_version !== '0.9') {
    throw new Error(`Invalid wire_version: expected 0.9, got ${receipt.wire_version}`);
  }

  if (!receipt.subject?.uri) {
    throw new Error('Missing subject.uri');
  }

  if (!receipt.aipref?.status) {
    throw new Error('Missing aipref.status');
  }

  if (!receipt.purpose) {
    throw new Error('Missing purpose');
  }

  if (!receipt.enforcement?.method) {
    throw new Error('Missing enforcement.method');
  }

  if (!receipt.iat || typeof receipt.iat !== 'number') {
    throw new Error('Missing or invalid iat field');
  }

  if (!receipt.kid) {
    throw new Error('Missing kid');
  }

  // Validate payment structure if present
  if (receipt.payment) {
    if (!receipt.payment.scheme) {
      throw new Error('Missing payment.scheme');
    }
    if (typeof receipt.payment.amount !== 'number') {
      throw new Error('Missing or invalid payment.amount');
    }
    if (!receipt.payment.currency) {
      throw new Error('Missing payment.currency');
    }
  }

  // Validate expiration if present
  if (receipt.exp && receipt.exp <= receipt.iat) {
    throw new Error('exp must be after iat');
  }
}
