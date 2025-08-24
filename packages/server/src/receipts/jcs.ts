/**
 * JCS Canonicalization (RFC 8785) for Receipts
 */

import * as jose from 'jose';
import canonicalize from 'canonicalize';
import pino from 'pino';
import { JWKSManager } from '../security/jwks-manager';

const logger = pino({ name: 'receipts' });

export interface PEACReceipt {
  receipt_id: string;
  agreement_id: string;
  charge_id: string;
  amount: string;
  currency: string;
  asset?: string;
  issued_at: string;
  provider: string;
  provider_tx_id?: string;
  x402_shares?: Array<{
    recipient: string;
    amount: string;
    reason: string;
  }>;
  proofs?: Array<{
    type: string;
    data: string;
    timestamp: string;
  }>;
  'x-release': string;
}

export class ReceiptService {
  constructor(private jwksManager: JWKSManager) {}

  async createReceipt(data: PEACReceipt): Promise<string> {
    // Canonicalize using JCS
    const canonical = canonicalize(data);
    if (!canonical) {
      throw new Error('Failed to canonicalize receipt');
    }

    logger.debug({ receipt_id: data.receipt_id }, 'Creating receipt');

    // Create JWS (not JWT)
    const encoder = new TextEncoder();
    const protectedHeader = {
      alg: 'ES256',
      kid: this.jwksManager.getLatestKid(),
      typ: 'application/peac-receipt+jws',
    };

    const jws = await new jose.CompactSign(encoder.encode(canonical))
      .setProtectedHeader(protectedHeader)
      .sign(await this.jwksManager.getSigningKey());

    // For detached signature, split and return header..signature
    const [header, , signature] = jws.split('.');
    const detached = `${header}..${signature}`;

    logger.info({ receipt_id: data.receipt_id }, 'Receipt created');

    return detached;
  }

  async verifyReceipt(
    jws: string,
    payload: PEACReceipt,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Canonicalize payload
      const canonical = canonicalize(payload);
      if (!canonical) {
        throw new Error('Failed to canonicalize payload');
      }

      // Verify using detached JWS method
      await this.jwksManager.verifyJws(jws, Buffer.from(canonical));

      // Check typ header
      const [header] = jws.split('..');
      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());

      if (decodedHeader.typ !== 'application/peac-receipt+jws') {
        throw new Error('Invalid receipt type');
      }

      logger.debug({ receipt_id: payload.receipt_id }, 'Receipt verified');

      return { valid: true };
    } catch (error: unknown) {
      logger.error({ err: error }, 'Receipt verification failed');
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
