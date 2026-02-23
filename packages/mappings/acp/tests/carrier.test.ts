/**
 * Tests for ACP carrier adapter (Evidence Carrier Contract, DD-124).
 */

import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  ACP_CARRIER_LIMITS,
  attachCarrierToACPHeaders,
  attachCarrierToACPMessage,
  extractCarrierFromACPHeaders,
  extractCarrierFromACPHeadersAsync,
  AcpCarrierAdapter,
} from '../src/carrier';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

const VALID_REF =
  'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'];

async function makeCarrier(): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(SAMPLE_JWS);
  return { receipt_ref: ref, receipt_jws: SAMPLE_JWS };
}

// ---------------------------------------------------------------------------
// attachCarrierToACPHeaders
// ---------------------------------------------------------------------------

describe('attachCarrierToACPHeaders', () => {
  it('should set PEAC-Receipt header with compact JWS', async () => {
    const carrier = await makeCarrier();
    const headers: Record<string, string> = {};

    attachCarrierToACPHeaders(headers, carrier);

    expect(headers[PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });

  it('should throw when receipt_jws is absent (reference mode not supported)', () => {
    const carrier: PeacEvidenceCarrier = { receipt_ref: VALID_REF };
    const headers: Record<string, string> = {};

    expect(() => attachCarrierToACPHeaders(headers, carrier)).toThrow(
      /ACP carrier requires receipt_jws/
    );
  });

  it('should preserve existing headers', async () => {
    const carrier = await makeCarrier();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    attachCarrierToACPHeaders(headers, carrier);

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers[PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });
});

// ---------------------------------------------------------------------------
// attachCarrierToACPMessage
// ---------------------------------------------------------------------------

describe('attachCarrierToACPMessage', () => {
  it('should create headers if not present', async () => {
    const carrier = await makeCarrier();
    const msg = { body: { data: 'test' } };

    const result = attachCarrierToACPMessage(msg, carrier);

    expect(result.headers).toBeDefined();
    expect(result.headers![PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });

  it('should validate carrier constraints before attachment', () => {
    const oversizeJws = 'a'.repeat(100_000);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: VALID_REF,
      receipt_jws: oversizeJws,
    };

    expect(() => attachCarrierToACPMessage({}, carrier)).toThrow(/Carrier constraint violation/);
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromACPHeaders (sync)
// ---------------------------------------------------------------------------

describe('extractCarrierFromACPHeaders', () => {
  it('should extract carrier from PEAC-Receipt header', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = extractCarrierFromACPHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
    expect(result!.meta.transport).toBe('acp');
    expect(result!.meta.format).toBe('embed');
  });

  it('should perform case-insensitive header lookup (RFC 9110)', () => {
    const headers = { 'peac-receipt': SAMPLE_JWS };

    const result = extractCarrierFromACPHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should return null when no PEAC-Receipt header', () => {
    const headers = { 'Content-Type': 'application/json' };

    expect(extractCarrierFromACPHeaders(headers)).toBeNull();
  });

  it('should return null for empty header value', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: '' };

    expect(extractCarrierFromACPHeaders(headers)).toBeNull();
  });

  it('should include redaction note for pending receipt_ref', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = extractCarrierFromACPHeaders(headers);

    expect(result!.meta.redaction).toContain('receipt_ref_pending_async');
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromACPHeadersAsync
// ---------------------------------------------------------------------------

describe('extractCarrierFromACPHeadersAsync', () => {
  it('should compute receipt_ref from JWS', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await extractCarrierFromACPHeadersAsync(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result!.violations).toEqual([]);
  });

  it('should produce consistent receipt_ref', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await extractCarrierFromACPHeadersAsync(headers);
    const expectedRef = await computeReceiptRef(SAMPLE_JWS);

    expect(result!.receipts[0].receipt_ref).toBe(expectedRef);
  });

  it('should return null when no header present', async () => {
    const result = await extractCarrierFromACPHeadersAsync({});

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AcpCarrierAdapter
// ---------------------------------------------------------------------------

describe('AcpCarrierAdapter', () => {
  const adapter = new AcpCarrierAdapter();

  it('should extract from message with headers', () => {
    const msg = { headers: { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS } };

    const result = adapter.extract(msg);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
  });

  it('should return null for message without headers', () => {
    const msg = { body: { data: 'test' } };

    expect(adapter.extract(msg)).toBeNull();
  });

  it('should attach carrier to message', async () => {
    const carrier = await makeCarrier();
    const msg = { body: { data: 'test' } };

    const result = adapter.attach(msg, [carrier]);

    expect(result.headers![PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });

  it('should not modify message when carriers array is empty', () => {
    const msg = { body: { data: 'test' } };

    const result = adapter.attach(msg, []);

    expect(result.headers).toBeUndefined();
  });

  it('should validate constraints with header-sized limits', async () => {
    const carrier = await makeCarrier();
    const meta: CarrierMeta = {
      transport: 'acp',
      format: 'embed',
      max_size: ACP_CARRIER_LIMITS.headers,
    };

    const validation = adapter.validateConstraints(carrier, meta);

    expect(validation.valid).toBe(true);
    expect(validation.violations).toEqual([]);
  });

  describe('round-trip', () => {
    it('should attach then extract with consistent JWS', async () => {
      const carrier = await makeCarrier();
      const msg = {};

      const attached = adapter.attach(msg, [carrier]);
      const extracted = adapter.extract(attached);

      expect(extracted).not.toBeNull();
      expect(extracted!.receipts[0].receipt_jws).toBe(carrier.receipt_jws);
    });
  });
});
