/**
 * Tests for x402 carrier adapter (Evidence Carrier Contract, DD-124).
 */

import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  X402_CARRIER_LIMITS,
  fromOfferResponse,
  fromOfferResponseAsync,
  fromSettlementResponse,
  fromSettlementResponseAsync,
  X402CarrierAdapter,
  toPeacCarrier,
  mapX402ToChallengeType,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_JWS =
  'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

async function makeCarrier(): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(SAMPLE_JWS);
  return { receipt_ref: ref, receipt_jws: SAMPLE_JWS };
}

// ---------------------------------------------------------------------------
// fromOfferResponse (sync)
// ---------------------------------------------------------------------------

describe('fromOfferResponse', () => {
  it('should extract carrier from PEAC-Receipt header', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = fromOfferResponse(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
    expect(result!.meta.transport).toBe('x402');
    expect(result!.meta.format).toBe('embed');
  });

  it('should perform case-insensitive header lookup', () => {
    const headers = { 'peac-receipt': SAMPLE_JWS };

    const result = fromOfferResponse(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should return null when no PEAC-Receipt header', () => {
    const headers = { 'Content-Type': 'application/json' };

    expect(fromOfferResponse(headers)).toBeNull();
  });

  it('should return null for empty header value', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: '' };

    expect(fromOfferResponse(headers)).toBeNull();
  });

  it('should include redaction note for pending receipt_ref', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = fromOfferResponse(headers);

    expect(result!.meta.redaction).toContain('receipt_ref_pending_async');
  });
});

// ---------------------------------------------------------------------------
// fromOfferResponseAsync (DD-129)
// ---------------------------------------------------------------------------

describe('fromOfferResponseAsync', () => {
  it('should compute receipt_ref from JWS', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await fromOfferResponseAsync(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result!.violations).toEqual([]);
  });

  it('should produce consistent receipt_ref', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await fromOfferResponseAsync(headers);
    const expectedRef = await computeReceiptRef(SAMPLE_JWS);

    expect(result!.receipts[0].receipt_ref).toBe(expectedRef);
  });

  it('should return null when no header present', async () => {
    const result = await fromOfferResponseAsync({});

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fromSettlementResponse
// ---------------------------------------------------------------------------

describe('fromSettlementResponse', () => {
  it('should extract carrier from settlement response headers', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = fromSettlementResponse(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should return null when no header', () => {
    expect(fromSettlementResponse({})).toBeNull();
  });
});

describe('fromSettlementResponseAsync', () => {
  it('should compute receipt_ref for settlement', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await fromSettlementResponseAsync(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// toPeacCarrier
// ---------------------------------------------------------------------------

describe('toPeacCarrier', () => {
  it('should create carrier with computed receipt_ref', async () => {
    const carrier = await toPeacCarrier(SAMPLE_JWS);

    expect(carrier.receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(carrier.receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should use shared computeReceiptRef (correction item 4)', async () => {
    const carrier = await toPeacCarrier(SAMPLE_JWS);
    const expectedRef = await computeReceiptRef(SAMPLE_JWS);

    expect(carrier.receipt_ref).toBe(expectedRef);
  });

  it('should be deterministic', async () => {
    const carrier1 = await toPeacCarrier(SAMPLE_JWS);
    const carrier2 = await toPeacCarrier(SAMPLE_JWS);

    expect(carrier1.receipt_ref).toBe(carrier2.receipt_ref);
  });
});

// ---------------------------------------------------------------------------
// mapX402ToChallengeType
// ---------------------------------------------------------------------------

describe('mapX402ToChallengeType', () => {
  it('should always return payment for x402', () => {
    expect(mapX402ToChallengeType()).toBe('payment');
  });
});

// ---------------------------------------------------------------------------
// X402CarrierAdapter
// ---------------------------------------------------------------------------

describe('X402CarrierAdapter', () => {
  const adapter = new X402CarrierAdapter();

  it('should extract from response with headers', () => {
    const response = { headers: { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS } };

    const result = adapter.extract(response);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
  });

  it('should return null for response without headers', () => {
    const response = { body: { data: 'test' } };

    expect(adapter.extract(response)).toBeNull();
  });

  it('should attach carrier to response headers', async () => {
    const carrier = await makeCarrier();
    const response = { body: { data: 'test' } };

    const result = adapter.attach(response, [carrier]);

    expect(result.headers).toBeDefined();
    expect(result.headers![PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });

  it('should not modify response when carriers array is empty', () => {
    const response = { body: { data: 'test' } };

    const result = adapter.attach(response, []);

    expect(result.headers).toBeUndefined();
  });

  it('should reject oversize carrier on attach', () => {
    const oversizeJws = 'a'.repeat(100_000);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
      receipt_jws: oversizeJws,
    };

    expect(() => adapter.attach({}, [carrier])).toThrow(
      /Carrier constraint violation/
    );
  });

  it('should throw when receipt_jws is absent (reference mode not supported)', () => {
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    };

    expect(() => adapter.attach({}, [carrier])).toThrow(
      /x402 carrier requires receipt_jws/
    );
  });

  it('should validate constraints with header-sized limits', async () => {
    const carrier = await makeCarrier();
    const meta: CarrierMeta = {
      transport: 'x402',
      format: 'embed',
      max_size: X402_CARRIER_LIMITS.headers,
    };

    const validation = adapter.validateConstraints(carrier, meta);

    expect(validation.valid).toBe(true);
    expect(validation.violations).toEqual([]);
  });

  describe('round-trip', () => {
    it('should attach then extract with consistent JWS', async () => {
      const carrier = await makeCarrier();
      const response = {};

      const attached = adapter.attach(response, [carrier]);
      const extracted = adapter.extract(attached);

      expect(extracted).not.toBeNull();
      expect(extracted!.receipts[0].receipt_jws).toBe(carrier.receipt_jws);
    });
  });
});
