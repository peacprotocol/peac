import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  attachReceiptToMeta,
  extractReceiptFromMeta,
  extractReceiptFromMetaAsync,
  McpCarrierAdapter,
  META_KEY_RECEIPT_REF,
  META_KEY_RECEIPT_JWS,
  META_KEY_LEGACY_RECEIPT,
  META_KEY_AGENT_ID,
  META_KEY_VERIFIED_AT,
} from '../src/index';

const VALID_REF = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VALID_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.dGVzdHNpZw';

const VALID_CARRIER: PeacEvidenceCarrier = {
  receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
  receipt_jws: VALID_JWS,
};

const REF_ONLY_CARRIER: PeacEvidenceCarrier = {
  receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
};

// ---------------------------------------------------------------------------
// attachReceiptToMeta
// ---------------------------------------------------------------------------

describe('attachReceiptToMeta', () => {
  it('writes receipt_ref and receipt_jws to _meta', () => {
    const result = { content: 'test' };
    attachReceiptToMeta(result, VALID_CARRIER);

    expect(result._meta![META_KEY_RECEIPT_REF]).toBe(VALID_REF);
    expect(result._meta![META_KEY_RECEIPT_JWS]).toBe(VALID_JWS);
  });

  it('writes only receipt_ref when no JWS', () => {
    const result = { content: 'test' };
    attachReceiptToMeta(result, REF_ONLY_CARRIER);

    expect(result._meta![META_KEY_RECEIPT_REF]).toBe(VALID_REF);
    expect(result._meta![META_KEY_RECEIPT_JWS]).toBeUndefined();
  });

  it('initializes _meta if absent', () => {
    const result: Record<string, unknown> = {};
    attachReceiptToMeta(result, VALID_CARRIER);
    expect(result._meta).toBeDefined();
  });

  it('preserves existing _meta keys', () => {
    const result = { _meta: { existing: 'value' } };
    attachReceiptToMeta(result, VALID_CARRIER);
    expect((result._meta as Record<string, unknown>).existing).toBe('value');
  });

  it('writes legacy format when opts.legacyFormat is true', () => {
    const result = { content: 'test' };
    attachReceiptToMeta(result, VALID_CARRIER, { legacyFormat: true });

    expect(result._meta![META_KEY_LEGACY_RECEIPT]).toBe(VALID_JWS);
    expect(result._meta![META_KEY_RECEIPT_REF]).toBeUndefined();
  });

  it('includes agentId and verifiedAt when provided', () => {
    const result = { content: 'test' };
    attachReceiptToMeta(result, VALID_CARRIER, {
      agentId: 'agent:test',
      verifiedAt: '2026-02-23T00:00:00Z',
    });

    expect(result._meta![META_KEY_AGENT_ID]).toBe('agent:test');
    expect(result._meta![META_KEY_VERIFIED_AT]).toBe('2026-02-23T00:00:00Z');
  });

  it('throws on oversized carrier', () => {
    const oversized: PeacEvidenceCarrier = {
      ...VALID_CARRIER,
      policy_binding: 'x'.repeat(100_000),
    };
    expect(() => attachReceiptToMeta({}, oversized)).toThrow(/constraint violation/i);
  });
});

// ---------------------------------------------------------------------------
// extractReceiptFromMeta (sync)
// ---------------------------------------------------------------------------

describe('extractReceiptFromMeta', () => {
  it('extracts from new carrier format', () => {
    const result = {
      _meta: { [META_KEY_RECEIPT_REF]: VALID_REF, [META_KEY_RECEIPT_JWS]: VALID_JWS },
    };
    const extracted = extractReceiptFromMeta(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_ref).toBe(VALID_REF);
    expect(extracted!.receipts[0].receipt_jws).toBe(VALID_JWS);
  });

  it('extracts ref-only carrier', () => {
    const result = { _meta: { [META_KEY_RECEIPT_REF]: VALID_REF } };
    const extracted = extractReceiptFromMeta(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_jws).toBeUndefined();
  });

  it('extracts from legacy format (v0.10.13)', () => {
    const result = { _meta: { [META_KEY_LEGACY_RECEIPT]: VALID_JWS } };
    const extracted = extractReceiptFromMeta(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_jws).toBe(VALID_JWS);
    expect(extracted!.meta.redaction).toContain('legacy_receipt_ref_pending');
  });

  it('prefers new format over legacy', () => {
    const result = {
      _meta: {
        [META_KEY_RECEIPT_REF]: VALID_REF,
        [META_KEY_RECEIPT_JWS]: VALID_JWS,
        [META_KEY_LEGACY_RECEIPT]: 'old-jws',
      },
    };
    const extracted = extractReceiptFromMeta(result);
    expect(extracted!.receipts[0].receipt_jws).toBe(VALID_JWS);
  });

  it('returns null for missing _meta', () => {
    expect(extractReceiptFromMeta({})).toBeNull();
  });

  it('returns null for empty _meta', () => {
    expect(extractReceiptFromMeta({ _meta: {} })).toBeNull();
  });

  it('returns null for invalid receipt_ref', () => {
    const result = { _meta: { [META_KEY_RECEIPT_REF]: 'not-valid' } };
    expect(extractReceiptFromMeta(result)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractReceiptFromMetaAsync (DD-129)
// ---------------------------------------------------------------------------

describe('extractReceiptFromMetaAsync', () => {
  it('passes with consistent receipt_ref and receipt_jws', async () => {
    const ref = await computeReceiptRef(VALID_JWS);
    const result = { _meta: { [META_KEY_RECEIPT_REF]: ref, [META_KEY_RECEIPT_JWS]: VALID_JWS } };

    const extracted = await extractReceiptFromMetaAsync(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.violations).toHaveLength(0);
  });

  it('reports violation for inconsistent receipt_ref', async () => {
    const result = {
      _meta: { [META_KEY_RECEIPT_REF]: VALID_REF, [META_KEY_RECEIPT_JWS]: VALID_JWS },
    };

    const extracted = await extractReceiptFromMetaAsync(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.violations.length).toBeGreaterThan(0);
    expect(extracted!.violations[0]).toContain('receipt_ref mismatch');
  });

  it('computes receipt_ref for legacy format (Polish B)', async () => {
    const result = { _meta: { [META_KEY_LEGACY_RECEIPT]: VALID_JWS } };
    const extracted = await extractReceiptFromMetaAsync(result);

    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(extracted!.receipts[0].receipt_jws).toBe(VALID_JWS);
    expect(extracted!.violations).toHaveLength(0);
  });

  it('returns null for empty _meta', async () => {
    expect(await extractReceiptFromMetaAsync({ _meta: {} })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// McpCarrierAdapter
// ---------------------------------------------------------------------------

describe('McpCarrierAdapter', () => {
  const adapter = new McpCarrierAdapter();

  it('round-trips: attach then extract', () => {
    const result = {};
    adapter.attach(result, [VALID_CARRIER]);

    const extracted = adapter.extract(result);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_ref).toBe(VALID_REF);
  });

  it('extract returns null when no carrier', () => {
    expect(adapter.extract({})).toBeNull();
  });
});
