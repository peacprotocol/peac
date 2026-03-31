/**
 * V2 mapping tests: toPeacRecordV2()
 *
 * Verifies that V2 normalized offers and receipts produce correct
 * PEAC interaction records with V2-specific evidence fields.
 */

import { describe, it, expect } from 'vitest';
import { toPeacRecordV2 } from '../src/map.js';
import type { NormalizedV2Offer, NormalizedV2Receipt } from '../src/normalize-v2.js';
import type { RawSignedOffer, RawSignedReceipt } from '../src/raw.js';
import { X402_OFFER_RECEIPT_PROFILE } from '../src/types.js';

const V2_OFFER: NormalizedV2Offer = {
  version: 2,
  resource: {
    url: 'https://api.example.com/premium',
    description: 'Premium API',
    mimeType: 'application/json',
  },
  scheme: 'exact',
  network: 'eip155:1',
  asset: 'USDC',
  payTo: '0xPayee',
  amount: '1000',
  maxTimeoutSeconds: 300,
  extra: {},
};

const V2_RECEIPT: NormalizedV2Receipt = {
  version: 2,
  network: 'eip155:1',
  payer: '0xPayer',
  transaction: '0xabc123',
  resourceUrl: 'https://api.example.com/premium',
  issuedAt: 1711900000,
};

const RAW_OFFER: RawSignedOffer = {
  format: 'jws',
  compactJws: 'eyJ0eXAiOiJKV1QifQ.eyJ0ZXN0Ijp0cnVlfQ.c2lnbmF0dXJl',
};

const RAW_RECEIPT: RawSignedReceipt = {
  format: 'jws',
  compactJws: 'eyJ0eXAiOiJKV1QifQ.eyJyZWNlaXB0Ijp0cnVlfQ.c2lnbmF0dXJl',
};

describe('toPeacRecordV2()', () => {
  it('produces a valid PEAC record with V2 evidence', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.version).toBe(X402_OFFER_RECEIPT_PROFILE);
    expect(record.evidence.resourceUrl).toBe('https://api.example.com/premium');
    expect(record.evidence.network).toBe('eip155:1');
    expect(record.evidence.payee).toBe('0xPayee');
    expect(record.evidence.asset).toBe('USDC');
    expect(record.evidence.amount).toBe('1000');
    expect(record.evidence.offerVersion).toBe(2);
    expect(record.evidence.payer).toBe('0xPayer');
    expect(record.evidence.transaction).toBe('0xabc123');
    expect(record.evidence.issuedAt).toBe(1711900000);
    expect(record.evidence.receiptVersion).toBe(2);
  });

  it('includes V2-specific fields: maxTimeoutSeconds and scheme', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.evidence.maxTimeoutSeconds).toBe(300);
    expect(record.evidence.scheme).toBe('exact');
  });

  it('preserves raw artifacts in proofs (proof preservation discipline)', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.proofs.x402.offer).toBe(RAW_OFFER);
    expect(record.proofs.x402.receipt).toBe(RAW_RECEIPT);
  });

  it('populates resourceUrl hint from receipt', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.hints.resourceUrl).toBe('https://api.example.com/premium');
  });

  it('populates verification hints when options provided', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT, {
      cryptoVerified: true,
      cryptoResult: { valid: true, signer: '0xSigner' },
    });

    expect(record.hints.verification?.cryptographic.verified).toBe(true);
    expect(record.hints.verification?.cryptographic.signer).toBe('0xSigner');
  });

  it('defaults cryptographic verification to not_checked', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.hints.verification?.cryptographic.verified).toBe(false);
    expect(record.hints.verification?.cryptographic.reason).toBe('not_checked');
  });

  it('omits optional receipt fields when absent', () => {
    const receiptNoTx: NormalizedV2Receipt = {
      ...V2_RECEIPT,
      transaction: undefined,
    };
    const record = toPeacRecordV2(V2_OFFER, receiptNoTx, RAW_OFFER, RAW_RECEIPT);

    expect(record.evidence.transaction).toBeUndefined();
    expect(record.evidence.payer).toBe('0xPayer');
  });

  it('uses resource.url for evidence resourceUrl (not receipt resourceUrl)', () => {
    const offerDifferentUrl = {
      ...V2_OFFER,
      resource: { ...V2_OFFER.resource, url: 'https://different.example.com/resource' },
    };
    const record = toPeacRecordV2(offerDifferentUrl, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.evidence.resourceUrl).toBe('https://different.example.com/resource');
  });

  it('includes createdAt timestamp', () => {
    const record = toPeacRecordV2(V2_OFFER, V2_RECEIPT, RAW_OFFER, RAW_RECEIPT);

    expect(record.createdAt).toBeTruthy();
    expect(new Date(record.createdAt).getTime()).not.toBeNaN();
  });
});
