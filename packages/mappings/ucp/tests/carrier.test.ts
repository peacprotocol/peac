/**
 * Tests for UCP carrier adapter (Evidence Carrier Contract, DD-124).
 */

import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { computeReceiptRef, validateCarrierConstraints } from '@peac/schema';
import {
  UCP_MAX_CARRIER_SIZE,
  UCP_LEGACY_EXTENSION_KEY,
  attachCarrierToWebhookPayload,
  extractCarrierFromWebhookPayload,
  extractCarrierFromWebhookPayloadAsync,
  UcpCarrierAdapter,
} from '../src/carrier.js';
import type { UcpWebhookPayload } from '../src/carrier.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_JWS =
  'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

async function makeCarrier(): Promise<PeacEvidenceCarrier> {
  const ref = await computeReceiptRef(SAMPLE_JWS);
  return { receipt_ref: ref, receipt_jws: SAMPLE_JWS };
}

function makeMinimalCarrier(): PeacEvidenceCarrier {
  return {
    receipt_ref:
      'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as PeacEvidenceCarrier['receipt_ref'],
  };
}

// ---------------------------------------------------------------------------
// attachCarrierToWebhookPayload
// ---------------------------------------------------------------------------

describe('attachCarrierToWebhookPayload', () => {
  it('should set peac_evidence field on payload', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = { event_type: 'order.complete' };

    const result = attachCarrierToWebhookPayload(payload, carrier);

    expect(result.peac_evidence).toBeDefined();
    expect(result.peac_evidence!.receipt_ref).toBe(carrier.receipt_ref);
    expect(result.peac_evidence!.receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should preserve existing payload fields', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = {
      event_type: 'order.complete',
      order_id: 'ord_123',
    };

    const result = attachCarrierToWebhookPayload(payload, carrier);

    expect(result.event_type).toBe('order.complete');
    expect(result.order_id).toBe('ord_123');
    expect(result.peac_evidence).toBeDefined();
  });

  it('should validate carrier constraints before attachment', () => {
    const oversizeJws = 'a'.repeat(100_000);
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000' as PeacEvidenceCarrier['receipt_ref'],
      receipt_jws: oversizeJws,
    };

    expect(() =>
      attachCarrierToWebhookPayload({ event_type: 'test' }, carrier)
    ).toThrow(/Carrier constraint violation/);
  });

  it('should accept custom meta for validation', async () => {
    const carrier = await makeCarrier();
    const customMeta: CarrierMeta = {
      transport: 'ucp',
      format: 'embed',
      max_size: UCP_MAX_CARRIER_SIZE,
    };

    const result = attachCarrierToWebhookPayload({}, carrier, customMeta);

    expect(result.peac_evidence).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromWebhookPayload (sync)
// ---------------------------------------------------------------------------

describe('extractCarrierFromWebhookPayload', () => {
  it('should extract from peac_evidence field', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = {
      event_type: 'order.complete',
      peac_evidence: carrier,
    };

    const result = extractCarrierFromWebhookPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toBe(carrier.receipt_ref);
    expect(result!.meta.transport).toBe('ucp');
    expect(result!.meta.format).toBe('embed');
  });

  it('should fallback to legacy extension key', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = {
      event_type: 'order.complete',
      extensions: {
        [UCP_LEGACY_EXTENSION_KEY]: carrier,
      },
    };

    const result = extractCarrierFromWebhookPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toBe(carrier.receipt_ref);
  });

  it('should prefer peac_evidence over legacy extension', async () => {
    const carrier1 = await makeCarrier();
    const carrier2 = makeMinimalCarrier();
    const payload: UcpWebhookPayload = {
      peac_evidence: carrier1,
      extensions: {
        [UCP_LEGACY_EXTENSION_KEY]: carrier2,
      },
    };

    const result = extractCarrierFromWebhookPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts[0].receipt_ref).toBe(carrier1.receipt_ref);
  });

  it('should return null for empty payload', () => {
    expect(extractCarrierFromWebhookPayload({})).toBeNull();
  });

  it('should return null for invalid peac_evidence', () => {
    const payload: UcpWebhookPayload = {
      peac_evidence: { bad: 'data' } as unknown as PeacEvidenceCarrier,
    };

    expect(extractCarrierFromWebhookPayload(payload)).toBeNull();
  });

  it('should return null for invalid legacy extension data', () => {
    const payload: UcpWebhookPayload = {
      extensions: {
        [UCP_LEGACY_EXTENSION_KEY]: 'not-an-object',
      },
    };

    expect(extractCarrierFromWebhookPayload(payload)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractCarrierFromWebhookPayloadAsync (DD-129)
// ---------------------------------------------------------------------------

describe('extractCarrierFromWebhookPayloadAsync', () => {
  it('should validate receipt_ref consistency for valid carrier', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = { peac_evidence: carrier };

    const result = await extractCarrierFromWebhookPayloadAsync(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.violations).toEqual([]);
  });

  it('should report violations for mismatched receipt_ref', async () => {
    const carrier: PeacEvidenceCarrier = {
      receipt_ref:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as PeacEvidenceCarrier['receipt_ref'],
      receipt_jws: SAMPLE_JWS,
    };
    const payload: UcpWebhookPayload = { peac_evidence: carrier };

    const result = await extractCarrierFromWebhookPayloadAsync(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(0);
    expect(result!.violations).toHaveLength(1);
  });

  it('should return null for empty payload', async () => {
    expect(await extractCarrierFromWebhookPayloadAsync({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UcpCarrierAdapter
// ---------------------------------------------------------------------------

describe('UcpCarrierAdapter', () => {
  const adapter = new UcpCarrierAdapter();

  it('should extract carrier from webhook payload', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = { peac_evidence: carrier };

    const result = adapter.extract(payload);

    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
  });

  it('should return null for payload without evidence', () => {
    expect(adapter.extract({})).toBeNull();
  });

  it('should attach carrier to payload', async () => {
    const carrier = await makeCarrier();
    const payload: UcpWebhookPayload = { event_type: 'test' };

    const result = adapter.attach(payload, [carrier]);

    expect(result.peac_evidence).toBeDefined();
    expect(result.peac_evidence!.receipt_jws).toBe(SAMPLE_JWS);
  });

  it('should not modify payload when carriers array is empty', () => {
    const payload: UcpWebhookPayload = { event_type: 'test' };

    const result = adapter.attach(payload, []);

    expect(result.peac_evidence).toBeUndefined();
  });

  it('should validate constraints', async () => {
    const carrier = await makeCarrier();
    const meta: CarrierMeta = {
      transport: 'ucp',
      format: 'embed',
      max_size: UCP_MAX_CARRIER_SIZE,
    };

    const validation = adapter.validateConstraints(carrier, meta);

    expect(validation.valid).toBe(true);
  });

  describe('round-trip', () => {
    it('should attach then extract with consistent carrier', async () => {
      const carrier = await makeCarrier();
      const payload: UcpWebhookPayload = { event_type: 'order.complete' };

      const attached = adapter.attach(payload, [carrier]);
      const extracted = adapter.extract(attached);

      expect(extracted).not.toBeNull();
      expect(extracted!.receipts[0].receipt_ref).toBe(carrier.receipt_ref);
      expect(extracted!.receipts[0].receipt_jws).toBe(carrier.receipt_jws);
    });
  });
});
