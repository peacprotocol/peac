import { describe, it, expect } from 'vitest';
import { normalizeV2Offer, normalizeV2Offers, normalizeV2Receipt } from '../src/normalize-v2.js';
import type {
  RawV2PaymentRequired,
  RawV2PaymentRequiredAccept,
  RawV2Resource,
  RawV2SettlementResponse,
} from '../src/raw-v2.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESOURCE: RawV2Resource = {
  url: 'https://api.example.com/premium',
  description: 'Premium API access',
  mimeType: 'application/json',
};

const ACCEPT_ENTRY: RawV2PaymentRequiredAccept = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '100000',
  asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  maxTimeoutSeconds: 300,
  extra: { customField: 'preserved' },
};

const CHALLENGE: RawV2PaymentRequired = {
  x402Version: 2,
  error: 'PAYMENT-SIGNATURE header is required',
  resource: RESOURCE,
  accepts: [ACCEPT_ENTRY],
};

const SUCCESS_SETTLEMENT: RawV2SettlementResponse = {
  success: true,
  transaction: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  network: 'eip155:84532',
  payer: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
};

const FAILED_SETTLEMENT: RawV2SettlementResponse = {
  success: false,
  errorReason: 'insufficient_funds',
  transaction: '',
  network: 'eip155:84532',
  payer: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
};

// ---------------------------------------------------------------------------
// Tests: normalizeV2Offer
// ---------------------------------------------------------------------------

describe('normalizeV2Offer', () => {
  it('maps accept entry fields to NormalizedV2Offer', () => {
    const result = normalizeV2Offer(ACCEPT_ENTRY, RESOURCE);
    expect(result.version).toBe(2);
    expect(result.scheme).toBe('exact');
    expect(result.network).toBe('eip155:84532');
    expect(result.asset).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    expect(result.payTo).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(result.amount).toBe('100000');
  });

  it('preserves resource metadata', () => {
    const result = normalizeV2Offer(ACCEPT_ENTRY, RESOURCE);
    expect(result.resource.url).toBe('https://api.example.com/premium');
    expect(result.resource.description).toBe('Premium API access');
    expect(result.resource.mimeType).toBe('application/json');
  });

  it('preserves maxTimeoutSeconds (V2-specific, not epoch timestamp)', () => {
    const result = normalizeV2Offer(ACCEPT_ENTRY, RESOURCE);
    expect(result.maxTimeoutSeconds).toBe(300);
  });

  it('preserves extra data from upstream', () => {
    const result = normalizeV2Offer(ACCEPT_ENTRY, RESOURCE);
    expect(result.extra).toEqual({ customField: 'preserved' });
  });

  it('preserves empty extra object', () => {
    const entry = { ...ACCEPT_ENTRY, extra: {} };
    const result = normalizeV2Offer(entry, RESOURCE);
    expect(result.extra).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeV2Offers
// ---------------------------------------------------------------------------

describe('normalizeV2Offers', () => {
  it('normalizes all accepts from a challenge', () => {
    const results = normalizeV2Offers(CHALLENGE);
    expect(results).toHaveLength(1);
    expect(results[0].version).toBe(2);
    expect(results[0].resource.url).toBe('https://api.example.com/premium');
  });

  it('handles multiple accept entries with different timeouts', () => {
    const multiChallenge: RawV2PaymentRequired = {
      ...CHALLENGE,
      accepts: [
        ACCEPT_ENTRY,
        { ...ACCEPT_ENTRY, network: 'eip155:1', amount: '200000', maxTimeoutSeconds: 600 },
      ],
    };
    const results = normalizeV2Offers(multiChallenge);
    expect(results).toHaveLength(2);
    expect(results[0].maxTimeoutSeconds).toBe(300);
    expect(results[1].maxTimeoutSeconds).toBe(600);
    expect(results[1].network).toBe('eip155:1');
    expect(results[1].amount).toBe('200000');
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeV2Receipt
// ---------------------------------------------------------------------------

describe('normalizeV2Receipt', () => {
  it('normalizes successful settlement to V2 receipt', () => {
    const result = normalizeV2Receipt(
      SUCCESS_SETTLEMENT,
      'https://api.example.com/premium',
      1711900000
    );
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.network).toBe('eip155:84532');
    expect(result!.payer).toBe('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(result!.resourceUrl).toBe('https://api.example.com/premium');
    expect(result!.issuedAt).toBe(1711900000);
    expect(result!.transaction).toBe(
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    );
  });

  it('returns null for failed settlement', () => {
    const result = normalizeV2Receipt(
      FAILED_SETTLEMENT,
      'https://api.example.com/premium',
      1711900000
    );
    expect(result).toBeNull();
  });

  it('omits transaction when empty string in success', () => {
    const settlement: RawV2SettlementResponse = {
      success: true,
      transaction: '',
      network: 'eip155:84532',
      payer: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    };
    const result = normalizeV2Receipt(settlement, 'https://api.example.com/premium', 1711900000);
    expect(result).not.toBeNull();
    expect(result!.transaction).toBeUndefined();
  });

  it('preserves transaction when present', () => {
    const result = normalizeV2Receipt(
      SUCCESS_SETTLEMENT,
      'https://api.example.com/premium',
      1711900000
    );
    expect(result!.transaction).toBe(
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    );
  });
});
