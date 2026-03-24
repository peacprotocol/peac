/**
 * Tests for paymentauth carrier adapter (Evidence Carrier Contract).
 */

import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { PEAC_RECEIPT_HEADER, PEAC_RECEIPT_URL_HEADER } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  PAYMENTAUTH_CARRIER_LIMITS,
  PAYMENT_RECEIPT_HEADER,
  attachCarrierToPaymentauthHeaders,
  extractCarrierFromPaymentauthHeaders,
  extractCarrierFromPaymentauthHeadersAsync,
  PaymentauthCarrierAdapter,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

const SAMPLE_PAYMENT_RECEIPT = 'eyJzdGF0dXMiOiJzdWNjZXNzIiwibWV0aG9kIjoiZXhhbXBsZSJ9';

async function makeCarrier(): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(SAMPLE_JWS);
  return { receipt_ref: ref, receipt_jws: SAMPLE_JWS };
}

// ---------------------------------------------------------------------------
// attachCarrierToPaymentauthHeaders
// ---------------------------------------------------------------------------

describe('attachCarrierToPaymentauthHeaders', () => {
  it('should set PEAC-Receipt header', async () => {
    const carrier = await makeCarrier();
    const headers = attachCarrierToPaymentauthHeaders({}, carrier);

    expect(headers[PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
  });

  it('should set PEAC-Receipt-URL when present', async () => {
    const carrier = await makeCarrier();
    carrier.receipt_url = 'https://receipts.example.com/abc';
    const headers = attachCarrierToPaymentauthHeaders({}, carrier);

    expect(headers[PEAC_RECEIPT_URL_HEADER]).toBe('https://receipts.example.com/abc');
  });

  it('should throw when receipt_jws is absent', () => {
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
    };

    expect(() => attachCarrierToPaymentauthHeaders({}, carrier)).toThrow(/receipt_jws/);
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromPaymentauthHeaders (sync)
// ---------------------------------------------------------------------------

describe('extractCarrierFromPaymentauthHeaders', () => {
  it('should extract carrier from PEAC-Receipt header', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
    expect(result!.meta.transport).toBe('paymentauth');
  });

  it('should perform case-insensitive header lookup', () => {
    const headers = { 'peac-receipt': SAMPLE_JWS };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should return null when no compatible receipt header present', () => {
    expect(extractCarrierFromPaymentauthHeaders({ 'Content-Type': 'text/plain' })).toBeNull();
  });

  it('should return null when only Payment-Receipt is present (no PEAC carrier)', () => {
    // Payment-Receipt alone is an upstream artifact, not a PEAC carrier
    const headers = { [PAYMENT_RECEIPT_HEADER]: SAMPLE_PAYMENT_RECEIPT };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result).toBeNull();
  });

  it('should return null for empty header', () => {
    expect(extractCarrierFromPaymentauthHeaders({ [PEAC_RECEIPT_HEADER]: '' })).toBeNull();
  });

  it('should capture raw Payment-Receipt header alongside PEAC carrier', () => {
    const headers = {
      [PEAC_RECEIPT_HEADER]: SAMPLE_JWS,
      [PAYMENT_RECEIPT_HEADER]: SAMPLE_PAYMENT_RECEIPT,
    };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
    expect(result!.rawPaymentReceipt).toBe(SAMPLE_PAYMENT_RECEIPT);
  });

  it('should not set rawPaymentReceipt when Payment-Receipt absent', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result!.rawPaymentReceipt).toBeUndefined();
  });

  it('should include redaction note for pending receipt_ref', () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = extractCarrierFromPaymentauthHeaders(headers);

    expect(result!.meta.redaction).toContain('receipt_ref_pending_async');
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromPaymentauthHeadersAsync
// ---------------------------------------------------------------------------

describe('extractCarrierFromPaymentauthHeadersAsync', () => {
  it('should compute receipt_ref from JWS', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await extractCarrierFromPaymentauthHeadersAsync(headers);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result!.violations).toEqual([]);
  });

  it('should produce consistent receipt_ref', async () => {
    const headers = { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS };

    const result = await extractCarrierFromPaymentauthHeadersAsync(headers);
    const expectedRef = await computeReceiptRef(SAMPLE_JWS);

    expect(result!.receipts[0].receipt_ref).toBe(expectedRef);
  });

  it('should return null when no header present', async () => {
    expect(await extractCarrierFromPaymentauthHeadersAsync({})).toBeNull();
  });

  it('should capture raw Payment-Receipt in async path', async () => {
    const headers = {
      [PEAC_RECEIPT_HEADER]: SAMPLE_JWS,
      [PAYMENT_RECEIPT_HEADER]: SAMPLE_PAYMENT_RECEIPT,
    };

    const result = await extractCarrierFromPaymentauthHeadersAsync(headers);

    expect(result!.rawPaymentReceipt).toBe(SAMPLE_PAYMENT_RECEIPT);
  });
});

// ---------------------------------------------------------------------------
// PaymentauthCarrierAdapter
// ---------------------------------------------------------------------------

describe('PaymentauthCarrierAdapter', () => {
  const adapter = new PaymentauthCarrierAdapter();

  it('should extract from response with headers', () => {
    const response = { headers: { [PEAC_RECEIPT_HEADER]: SAMPLE_JWS } };

    const result = adapter.extract(response);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
  });

  it('should return null for response without headers', () => {
    expect(adapter.extract({ body: {} })).toBeNull();
  });

  it('should attach carrier to response headers', async () => {
    const carrier = await makeCarrier();
    const response = {};

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

  it('should validate constraints with header-sized limits', async () => {
    const carrier = await makeCarrier();
    const meta: CarrierMeta = {
      transport: 'paymentauth',
      format: 'embed',
      max_size: PAYMENTAUTH_CARRIER_LIMITS.headers,
    };

    const validation = adapter.validateConstraints(carrier, meta);

    expect(validation.valid).toBe(true);
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

    it('should preserve receipt_url through round-trip', async () => {
      const carrier = await makeCarrier();
      carrier.receipt_url = 'https://receipts.example.com/abc123';
      const response = {};

      const attached = adapter.attach(response, [carrier]);
      const extracted = adapter.extract(attached);

      expect(extracted!.receipts[0].receipt_url).toBe('https://receipts.example.com/abc123');
    });
  });

  describe('coexistence with Payment-Receipt', () => {
    it('should coexist with paymentauth Payment-Receipt header', async () => {
      const carrier = await makeCarrier();
      const response = {
        headers: {
          [PAYMENT_RECEIPT_HEADER]: SAMPLE_PAYMENT_RECEIPT,
        },
      };

      const attached = adapter.attach(response, [carrier]);

      // Both headers present
      expect(attached.headers![PEAC_RECEIPT_HEADER]).toBe(SAMPLE_JWS);
      expect(attached.headers![PAYMENT_RECEIPT_HEADER]).toBe(SAMPLE_PAYMENT_RECEIPT);

      // Extract sees PEAC carrier + raw Payment-Receipt
      const extracted = adapter.extract(attached);
      expect(extracted).not.toBeNull();
      expect(extracted!.receipts[0].receipt_jws).toBe(SAMPLE_JWS);
    });
  });
});
