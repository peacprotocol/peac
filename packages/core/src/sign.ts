/**
 * @peac/core v0.9.14 - JWS signing with typ: "peac.receipt/0.9"
 * Single PEAC-Receipt header, iat field, payment.scheme
 */

import { SignJWT, importJWK, type JWTPayload } from 'jose';
import { Receipt, KeySet, Kid, SigningOptions } from './types.js';
import { uuidv7 } from './ids/uuidv7.js';

export interface SignOptions {
  kid: Kid;
  privateKey: { kty: 'OKP'; crv: 'Ed25519'; d: string; x?: string };
}

export async function signReceipt(receipt: Receipt, options: SignOptions): Promise<string> {
  const { kid, privateKey } = options;

  // Import private key
  const key = await importJWK(privateKey, 'EdDSA');

  // Create JWT with v0.9.14 format
  const jwt = new SignJWT(receipt as JWTPayload)
    .setProtectedHeader({
      alg: 'EdDSA',
      typ: 'peac.receipt/0.9',
      kid,
    })
    .setIssuedAt(receipt.iat)
    .setJti(uuidv7());

  if (receipt.exp) {
    jwt.setExpirationTime(receipt.exp);
  }

  return await jwt.sign(key);
}

export interface SignReceiptOptions {
  subject: string;
  aipref: Receipt['aipref'];
  purpose: Receipt['purpose'];
  enforcement: Receipt['enforcement'];
  payment?: Receipt['payment'];
  kid: Kid;
  privateKey: { kty: 'OKP'; crv: 'Ed25519'; d: string; x?: string };
  crawler_type?: Receipt['crawler_type'];
  expires_in?: number;
  nonce?: string;
}

export async function createAndSignReceipt(options: SignReceiptOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const receipt: Receipt = {
    version: '0.9.14',
    protocol_version: '0.9.14',
    wire_version: '0.9',
    subject: {
      uri: options.subject,
    },
    aipref: options.aipref,
    purpose: options.purpose,
    enforcement: options.enforcement,
    payment: options.payment,
    crawler_type: options.crawler_type || 'unknown',
    iat: now,
    exp: options.expires_in ? now + options.expires_in : undefined,
    kid: options.kid,
    nonce: options.nonce,
  };

  return await signReceipt(receipt, {
    kid: options.kid,
    privateKey: options.privateKey,
  });
}
