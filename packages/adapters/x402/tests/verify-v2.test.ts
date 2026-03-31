/**
 * V2 verification tests: verifyOfferV2() and verifyReceiptV2()
 *
 * Verifies V2-specific validation logic including:
 * - Version gating (supportedVersions must include 2)
 * - maxTimeoutSeconds duration validation
 * - Strict-mode fail-closed for missing/invalid V2 fields
 * - Recency checks for V2 receipts
 * - V1 regression: default config rejects V2
 */

import { describe, it, expect } from 'vitest';
import {
  verifyOfferV2,
  verifyReceiptV2,
  verifyOfferUnified,
  verifyReceiptUnified,
} from '../src/verify.js';
import { normalizeV2Receipt } from '../src/normalize-v2.js';
import type { NormalizedV2Offer, NormalizedV2Receipt } from '../src/normalize-v2.js';
import type { X402AdapterConfig } from '../src/types.js';
import type { RawV2SettlementResponse } from '../src/raw-v2.js';

const VALID_V2_OFFER: NormalizedV2Offer = {
  version: 2,
  resource: {
    url: 'https://api.example.com/premium',
    description: 'Premium',
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

const NOW_SECONDS = 1711900000;

const VALID_V2_RECEIPT: NormalizedV2Receipt = {
  version: 2,
  network: 'eip155:1',
  payer: '0xPayer',
  transaction: '0xabc',
  resourceUrl: 'https://api.example.com/premium',
  issuedAt: NOW_SECONDS - 60,
};

const V2_CONFIG: X402AdapterConfig = {
  supportedVersions: [1, 2],
  nowSeconds: NOW_SECONDS,
};

describe('verifyOfferV2()', () => {
  describe('version gating', () => {
    it('rejects V2 offer when supportedVersions excludes 2', () => {
      const result = verifyOfferV2(VALID_V2_OFFER, { supportedVersions: [1] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_version_unsupported');
    });

    it('rejects V2 offer with default config (default is [1])', () => {
      const result = verifyOfferV2(VALID_V2_OFFER);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_version_unsupported');
    });

    it('accepts V2 offer when supportedVersions includes 2', () => {
      const result = verifyOfferV2(VALID_V2_OFFER, V2_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('required fields', () => {
    it('rejects offer with missing network', () => {
      const offer = { ...VALID_V2_OFFER, network: '' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'network')).toBe(true);
    });

    it('rejects offer with missing asset', () => {
      const offer = { ...VALID_V2_OFFER, asset: '' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'asset')).toBe(true);
    });

    it('rejects offer with missing payTo', () => {
      const offer = { ...VALID_V2_OFFER, payTo: '' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('rejects offer with missing amount', () => {
      const offer = { ...VALID_V2_OFFER, amount: '' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('rejects offer with missing scheme', () => {
      const offer = { ...VALID_V2_OFFER, scheme: '' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('rejects offer with missing resource.url', () => {
      const offer = { ...VALID_V2_OFFER, resource: { url: '', description: '', mimeType: '' } };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });
  });

  describe('maxTimeoutSeconds validation', () => {
    it('rejects zero maxTimeoutSeconds', () => {
      const offer = { ...VALID_V2_OFFER, maxTimeoutSeconds: 0 };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('maxTimeoutSeconds');
    });

    it('rejects negative maxTimeoutSeconds', () => {
      const offer = { ...VALID_V2_OFFER, maxTimeoutSeconds: -1 };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('accepts positive maxTimeoutSeconds', () => {
      const result = verifyOfferV2(VALID_V2_OFFER, V2_CONFIG);
      expect(result.valid).toBe(true);
    });
  });

  describe('network validation (strict mode)', () => {
    it('rejects invalid CAIP-2 network', () => {
      const offer = { ...VALID_V2_OFFER, network: 'invalid' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'network_invalid')).toBe(true);
    });

    it('accepts valid CAIP-2 network', () => {
      const offer = { ...VALID_V2_OFFER, network: 'eip155:137' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(true);
    });

    it('skips network validation when strictNetworkValidation is false', () => {
      const offer = { ...VALID_V2_OFFER, network: 'invalid' };
      const result = verifyOfferV2(offer, { ...V2_CONFIG, strictNetworkValidation: false });
      expect(result.valid).toBe(true);
    });
  });

  describe('amount validation (strict mode)', () => {
    it('rejects non-integer amount', () => {
      const offer = { ...VALID_V2_OFFER, amount: '12.5' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'amount_invalid')).toBe(true);
    });

    it('rejects negative amount', () => {
      const offer = { ...VALID_V2_OFFER, amount: '-100' };
      const result = verifyOfferV2(offer, V2_CONFIG);
      expect(result.valid).toBe(false);
    });
  });
});

describe('verifyReceiptV2()', () => {
  describe('version gating', () => {
    it('rejects V2 receipt when supportedVersions excludes 2', () => {
      const result = verifyReceiptV2(VALID_V2_RECEIPT, {
        supportedVersions: [1],
        nowSeconds: NOW_SECONDS,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('receipt_version_unsupported');
    });

    it('rejects V2 receipt with default config (default is [1])', () => {
      const result = verifyReceiptV2(VALID_V2_RECEIPT, { nowSeconds: NOW_SECONDS });
      expect(result.valid).toBe(false);
    });

    it('accepts V2 receipt when supportedVersions includes 2', () => {
      const result = verifyReceiptV2(VALID_V2_RECEIPT, V2_CONFIG);
      expect(result.valid).toBe(true);
    });
  });

  describe('required fields', () => {
    it('rejects receipt with missing network', () => {
      const receipt = { ...VALID_V2_RECEIPT, network: '' };
      const result = verifyReceiptV2(receipt, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('rejects receipt with missing payer', () => {
      const receipt = { ...VALID_V2_RECEIPT, payer: '' };
      const result = verifyReceiptV2(receipt, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('rejects receipt with missing resourceUrl', () => {
      const receipt = { ...VALID_V2_RECEIPT, resourceUrl: '' };
      const result = verifyReceiptV2(receipt, V2_CONFIG);
      expect(result.valid).toBe(false);
    });
  });

  describe('recency check', () => {
    it('rejects receipt older than recency window', () => {
      const oldReceipt = { ...VALID_V2_RECEIPT, issuedAt: NOW_SECONDS - 7200 };
      const result = verifyReceiptV2(oldReceipt, { ...V2_CONFIG, receiptRecencySeconds: 3600 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('receipt_too_old');
    });

    it('rejects receipt from the future beyond clock skew', () => {
      const futureReceipt = { ...VALID_V2_RECEIPT, issuedAt: NOW_SECONDS + 120 };
      const result = verifyReceiptV2(futureReceipt, V2_CONFIG);
      expect(result.valid).toBe(false);
    });

    it('accepts receipt within clock skew tolerance', () => {
      const slightlyFuture = { ...VALID_V2_RECEIPT, issuedAt: NOW_SECONDS + 30 };
      const result = verifyReceiptV2(slightlyFuture, V2_CONFIG);
      expect(result.valid).toBe(true);
    });

    it('accepts recent receipt within recency window', () => {
      const result = verifyReceiptV2(VALID_V2_RECEIPT, V2_CONFIG);
      expect(result.valid).toBe(true);
    });
  });

  describe('network validation', () => {
    it('rejects invalid CAIP-2 network in strict mode', () => {
      const receipt = { ...VALID_V2_RECEIPT, network: 'bad-format' };
      const result = verifyReceiptV2(receipt, V2_CONFIG);
      expect(result.valid).toBe(false);
    });
  });
});

describe('V1 regression: default config rejects V2', () => {
  it('verifyOfferV2 with no config fails (default supportedVersions=[1])', () => {
    const result = verifyOfferV2(VALID_V2_OFFER);
    expect(result.valid).toBe(false);
  });

  it('verifyReceiptV2 with no config fails (default supportedVersions=[1])', () => {
    const result = verifyReceiptV2(VALID_V2_RECEIPT);
    expect(result.valid).toBe(false);
  });
});

describe('strict fail-closed: unknown/malformed V2 shapes', () => {
  it('rejects V2 offer with missing resource entirely', () => {
    const offer = { ...VALID_V2_OFFER, resource: { url: '', description: '', mimeType: '' } };
    const result = verifyOfferV2(offer, V2_CONFIG);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'resource.url')).toBe(true);
  });

  it('rejects V2 offer with missing scheme (required field check)', () => {
    const offer = { ...VALID_V2_OFFER, scheme: '' };
    const result = verifyOfferV2(offer, V2_CONFIG);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'scheme')).toBe(true);
  });

  it('rejects V2 offer with zero maxTimeoutSeconds', () => {
    const offer = { ...VALID_V2_OFFER, maxTimeoutSeconds: 0 };
    const result = verifyOfferV2(offer, V2_CONFIG);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'maxTimeoutSeconds')).toBe(true);
  });

  it('rejects V2 offer with invalid CAIP-2 network and non-integer amount together', () => {
    const offer = { ...VALID_V2_OFFER, network: 'not-caip2', amount: '12.5' };
    const result = verifyOfferV2(offer, V2_CONFIG);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'network_invalid')).toBe(true);
    expect(result.errors.some((e) => e.code === 'amount_invalid')).toBe(true);
  });

  it('rejects V2 receipt with empty payer and missing resourceUrl', () => {
    const receipt: NormalizedV2Receipt = {
      ...VALID_V2_RECEIPT,
      payer: '',
      resourceUrl: '',
    };
    const result = verifyReceiptV2(receipt, V2_CONFIG);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('upstream semantics regression', () => {
  it('maxTimeoutSeconds survives normalization through to verification', () => {
    const offerWith600s = { ...VALID_V2_OFFER, maxTimeoutSeconds: 600 };
    const result = verifyOfferV2(offerWith600s, V2_CONFIG);
    expect(result.valid).toBe(true);
  });

  it('failed settlement with transaction: "" does not produce a receipt', () => {
    const failedSettlement: RawV2SettlementResponse = {
      success: false,
      errorReason: 'insufficient_funds',
      transaction: '',
      network: 'eip155:1',
      payer: '0xPayer',
    };
    const receipt = normalizeV2Receipt(
      failedSettlement,
      'https://api.example.com/resource',
      NOW_SECONDS
    );
    expect(receipt).toBeNull();
  });

  it('successful settlement with empty transaction omits transaction in receipt', () => {
    const successNoTx: RawV2SettlementResponse = {
      success: true,
      transaction: '',
      network: 'eip155:1',
      payer: '0xPayer',
    };
    const receipt = normalizeV2Receipt(
      successNoTx,
      'https://api.example.com/resource',
      NOW_SECONDS
    );
    expect(receipt).not.toBeNull();
    expect(receipt!.transaction).toBeUndefined();
  });
});

describe('unified dispatchers', () => {
  it('verifyOfferUnified dispatches to V2 when wireVersion is 2', () => {
    const result = verifyOfferUnified(VALID_V2_OFFER, [], {
      ...V2_CONFIG,
      wireVersion: 2,
    });
    expect(result.valid).toBe(true);
  });

  it('verifyOfferUnified defaults to V1 path when wireVersion absent', () => {
    const result = verifyOfferUnified(VALID_V2_OFFER, []);
    expect('termMatching' in result).toBe(true);
  });

  it('verifyReceiptUnified dispatches to V2 when wireVersion is 2', () => {
    const result = verifyReceiptUnified(VALID_V2_RECEIPT, {
      ...V2_CONFIG,
      wireVersion: 2,
    });
    expect(result.valid).toBe(true);
  });

  it('verifyReceiptUnified defaults to V1 path when wireVersion absent', () => {
    const result = verifyReceiptUnified(VALID_V2_RECEIPT, { nowSeconds: NOW_SECONDS });
    expect(result.valid).toBe(false);
  });
});
