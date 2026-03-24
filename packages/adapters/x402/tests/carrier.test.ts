/**
 * Tests for x402 carrier adapter (Evidence Carrier Contract).
 *
 * v0.12.4: dual-header read compatibility (DD-193).
 * Priority: PEAC-Receipt > PAYMENT-RESPONSE (v2) > X-PAYMENT-RESPONSE (v1).
 */

import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  X402_CARRIER_LIMITS,
  extractReceiptArtifactFromHeaders,
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

const SAMPLE_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

const SAMPLE_X402_RECEIPT_JSON = JSON.stringify({
  format: 'eip712',
  signature: '0xabc123',
  payload: { version: 1 },
});

async function makeCarrier(): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(SAMPLE_JWS);
  return { receipt_ref: ref, receipt_jws: SAMPLE_JWS };
}

// ---------------------------------------------------------------------------
// extractReceiptArtifactFromHeaders (DD-193)
// ---------------------------------------------------------------------------

describe('extractReceiptArtifactFromHeaders', () => {
  it('should return PEAC-Receipt with source "peac"', () => {
    const result = extractReceiptArtifactFromHeaders({
      [PEAC_RECEIPT_HEADER]: SAMPLE_JWS,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('peac');
    expect(result!.headerName).toBe(PEAC_RECEIPT_HEADER);
    expect(result!.rawArtifact).toBe(SAMPLE_JWS);
    expect(result!.artifactKind).toBe('receipt');
  });

  it('should return x402 v2 header with source "x402_v2"', () => {
    const result = extractReceiptArtifactFromHeaders({
      'Payment-Response': SAMPLE_X402_RECEIPT_JSON,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('x402_v2');
    expect(result!.headerName).toBe('payment-response');
    expect(result!.rawArtifact).toBe(SAMPLE_X402_RECEIPT_JSON);
    expect(result!.artifactKind).toBe('receipt');
  });

  it('should return x402 v1 header with source "x402_v1"', () => {
    const result = extractReceiptArtifactFromHeaders({
      'X-Payment-Response': SAMPLE_X402_RECEIPT_JSON,
    });

    expect(result).not.toBeNull();
    expect(result!.source).toBe('x402_v1');
    expect(result!.headerName).toBe('x-payment-response');
    expect(result!.rawArtifact).toBe(SAMPLE_X402_RECEIPT_JSON);
    expect(result!.artifactKind).toBe('receipt');
  });

  it('should prefer PEAC-Receipt over x402 v2', () => {
    const result = extractReceiptArtifactFromHeaders({
      [PEAC_RECEIPT_HEADER]: SAMPLE_JWS,
      'Payment-Response': SAMPLE_X402_RECEIPT_JSON,
    });

    expect(result!.source).toBe('peac');
    expect(result!.rawArtifact).toBe(SAMPLE_JWS);
  });

  it('should prefer PEAC-Receipt over x402 v1', () => {
    const result = extractReceiptArtifactFromHeaders({
      [PEAC_RECEIPT_HEADER]: SAMPLE_JWS,
      'X-Payment-Response': SAMPLE_X402_RECEIPT_JSON,
    });

    expect(result!.source).toBe('peac');
  });

  it('should prefer x402 v2 over x402 v1', () => {
    const v2Json = JSON.stringify({ format: 'jws', signature: '0xv2' });
    const v1Json = JSON.stringify({ format: 'eip712', signature: '0xv1' });
    const result = extractReceiptArtifactFromHeaders({
      'Payment-Response': v2Json,
      'X-Payment-Response': v1Json,
    });

    expect(result!.source).toBe('x402_v2');
    expect(result!.rawArtifact).toBe(v2Json);
  });

  it('should perform case-insensitive matching for all headers', () => {
    // PEAC-Receipt case-insensitive
    expect(extractReceiptArtifactFromHeaders({ 'peac-receipt': SAMPLE_JWS })!.source).toBe('peac');
    // v2 case-insensitive
    expect(
      extractReceiptArtifactFromHeaders({ 'payment-response': SAMPLE_X402_RECEIPT_JSON })!.source
    ).toBe('x402_v2');
    expect(
      extractReceiptArtifactFromHeaders({ 'PAYMENT-RESPONSE': SAMPLE_X402_RECEIPT_JSON })!.source
    ).toBe('x402_v2');
    // v1 case-insensitive
    expect(
      extractReceiptArtifactFromHeaders({ 'x-payment-response': SAMPLE_X402_RECEIPT_JSON })!.source
    ).toBe('x402_v1');
    expect(
      extractReceiptArtifactFromHeaders({ 'X-PAYMENT-RESPONSE': SAMPLE_X402_RECEIPT_JSON })!.source
    ).toBe('x402_v1');
  });

  it('should return null when no receipt headers present', () => {
    expect(extractReceiptArtifactFromHeaders({ 'Content-Type': 'application/json' })).toBeNull();
  });

  it('should return null for empty header values', () => {
    expect(extractReceiptArtifactFromHeaders({ [PEAC_RECEIPT_HEADER]: '' })).toBeNull();
    expect(extractReceiptArtifactFromHeaders({ 'Payment-Response': '' })).toBeNull();
    expect(extractReceiptArtifactFromHeaders({ 'X-Payment-Response': '' })).toBeNull();
  });

  it('should parse JSON for x402 v2 artifacts', () => {
    const result = extractReceiptArtifactFromHeaders({
      'Payment-Response': SAMPLE_X402_RECEIPT_JSON,
    });

    expect(result!.parsedForm).toEqual(JSON.parse(SAMPLE_X402_RECEIPT_JSON));
  });

  it('should set parsedForm to undefined for non-JSON x402 artifacts', () => {
    const result = extractReceiptArtifactFromHeaders({
      'Payment-Response': 'not-json',
    });

    expect(result!.rawArtifact).toBe('not-json');
    expect(result!.parsedForm).toBeUndefined();
  });

  it('should NOT include PAYMENT-REQUIRED in receipt extraction path', () => {
    const result = extractReceiptArtifactFromHeaders({
      'Payment-Required': JSON.stringify({ amount: '1000' }),
    });

    expect(result).toBeNull();
  });
});

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

  it('should include artifactSource in meta', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = fromOfferResponse(headers);

    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('peac');
  });

  it('should fall back to x402 v2 header when PEAC-Receipt absent', () => {
    const headers = { 'Payment-Response': SAMPLE_X402_RECEIPT_JSON };

    const result = fromOfferResponse(headers);

    expect(result).not.toBeNull();
    // Upstream x402 artifact must NOT be in receipt_jws (not a PEAC JWS)
    expect(result!.receipts[0].receipt_jws).toBeUndefined();
    // Upstream artifact available via upstreamArtifact
    expect(result!.upstreamArtifact).toBeDefined();
    expect(result!.upstreamArtifact!.source).toBe('x402_v2');
    expect(result!.upstreamArtifact!.rawArtifact).toBe(SAMPLE_X402_RECEIPT_JSON);
    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('x402_v2');
  });

  it('should fall back to x402 v1 header when PEAC-Receipt and v2 absent', () => {
    const headers = { 'X-Payment-Response': SAMPLE_X402_RECEIPT_JSON };

    const result = fromOfferResponse(headers);

    expect(result).not.toBeNull();
    // Upstream x402 artifact must NOT be in receipt_jws
    expect(result!.receipts[0].receipt_jws).toBeUndefined();
    expect(result!.upstreamArtifact).toBeDefined();
    expect(result!.upstreamArtifact!.source).toBe('x402_v1');
    expect(result!.upstreamArtifact!.rawArtifact).toBe(SAMPLE_X402_RECEIPT_JSON);
    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('x402_v1');
  });

  it('should not set upstreamArtifact when source is PEAC', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = fromOfferResponse(headers);

    expect(result!.upstreamArtifact).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fromOfferResponseAsync
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

  it('should include artifactSource in meta', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await fromOfferResponseAsync(headers);

    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('peac');
  });

  it('should compute receipt_ref from x402 v2 artifact without populating receipt_jws', async () => {
    const headers = { 'Payment-Response': SAMPLE_X402_RECEIPT_JSON };

    const result = await fromOfferResponseAsync(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    // Upstream artifact: receipt_ref is computed but receipt_jws is NOT set
    expect(result!.receipts[0].receipt_jws).toBeUndefined();
    expect(result!.upstreamArtifact).toBeDefined();
    expect(result!.upstreamArtifact!.rawArtifact).toBe(SAMPLE_X402_RECEIPT_JSON);
    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('x402_v2');
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

  it('should fall back to x402 v1 header in settlement response', () => {
    const headers = { 'X-Payment-Response': SAMPLE_X402_RECEIPT_JSON };

    const result = fromSettlementResponse(headers);

    expect(result).not.toBeNull();
    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('x402_v1');
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

  it('should use shared computeReceiptRef', async () => {
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

  it('should extract from x402 v2 header via adapter', () => {
    const response = { headers: { 'Payment-Response': SAMPLE_X402_RECEIPT_JSON } };

    const result = adapter.extract(response);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect((result!.meta as Record<string, unknown>).artifactSource).toBe('x402_v2');
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

    expect(() => adapter.attach({}, [carrier])).toThrow(/Carrier constraint violation/);
  });

  it('should throw when receipt_jws is absent (reference mode not supported)', () => {
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    };

    expect(() => adapter.attach({}, [carrier])).toThrow(/x402 carrier requires receipt_jws/);
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

    it('should preserve receipt_url through attach and extract', async () => {
      const carrier = await makeCarrier();
      carrier.receipt_url = 'https://receipts.example.com/abc123';
      const response = {};

      const attached = adapter.attach(response, [carrier]);
      const extracted = adapter.extract(attached);

      expect(extracted).not.toBeNull();
      expect(extracted!.receipts[0].receipt_url).toBe('https://receipts.example.com/abc123');
    });
  });
});
