/**
 * Tests for experimental commerce evidence bundle (DD-192).
 */

import { describe, it, expect } from 'vitest';
import {
  createCommerceEvidenceBundle,
  addProtocolEvidence,
  addTimelineEntry,
  addReceiptRef,
  computeCommerceSummary,
  serializeCommerceBundle,
  COMMERCE_BUNDLE_VERSION,
} from '../src/index.js';
import type { ProtocolEvidence, TimelineEntry } from '../src/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(source: string, overrides?: Record<string, unknown>): ProtocolEvidence {
  return {
    source,
    captured_at: '2025-01-15T12:00:00Z',
    data: {
      payment_rail: source,
      amount_minor: '1000',
      currency: 'USD',
      ...overrides,
    },
  };
}

function makeTimeline(source: string, event: string, ts?: string): TimelineEntry {
  return {
    timestamp: ts ?? '2025-01-15T12:00:00Z',
    source,
    event,
  };
}

// ---------------------------------------------------------------------------
// createCommerceEvidenceBundle
// ---------------------------------------------------------------------------

describe('createCommerceEvidenceBundle', () => {
  it('should create a bundle with version and transaction_ref', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_abc123',
      created_at: '2025-06-01T12:00:00Z',
    });

    expect(bundle.version).toBe(COMMERCE_BUNDLE_VERSION);
    expect(bundle.version).toContain('-experimental');
    expect(bundle.transaction_ref).toBe('txn_abc123');
    expect(bundle.created_at).toBe('2025-06-01T12:00:00Z');
  });

  it('should default created_at to current time when not provided', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_default_time',
    });

    expect(bundle.created_at).toBeTruthy();
    expect(new Date(bundle.created_at).getTime()).toBeGreaterThan(0);
  });

  it('should create empty bundle when no evidence provided', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_empty',
    });

    expect(bundle.protocol_evidence).toEqual([]);
    expect(bundle.timeline).toEqual([]);
    expect(bundle.receipts).toEqual([]);
    expect(bundle.rails_observed).toEqual([]);
    expect(bundle.summary.evidence_count).toBe(0);
  });

  it('should accept initial evidence', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_123',
      evidence: [makeEvidence('stripe'), makeEvidence('paymentauth')],
    });

    expect(bundle.protocol_evidence).toHaveLength(2);
    expect(bundle.rails_observed).toContain('stripe');
    expect(bundle.rails_observed).toContain('paymentauth');
  });

  it('should sort initial timeline entries', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_123',
      timeline: [
        makeTimeline('stripe', 'settled', '2025-01-15T13:00:00Z'),
        makeTimeline('paymentauth', 'challenged', '2025-01-15T12:00:00Z'),
      ],
    });

    expect(bundle.timeline[0].source).toBe('paymentauth');
    expect(bundle.timeline[1].source).toBe('stripe');
  });
});

// ---------------------------------------------------------------------------
// addProtocolEvidence
// ---------------------------------------------------------------------------

describe('addProtocolEvidence', () => {
  it('should add evidence immutably', () => {
    const bundle = createCommerceEvidenceBundle({ transaction_ref: 'txn_1' });
    const updated = addProtocolEvidence(bundle, makeEvidence('stripe'));

    expect(bundle.protocol_evidence).toHaveLength(0);
    expect(updated.protocol_evidence).toHaveLength(1);
    expect(updated.rails_observed).toContain('stripe');
  });

  it('should update summary when evidence added', () => {
    const bundle = createCommerceEvidenceBundle({ transaction_ref: 'txn_1' });
    const updated = addProtocolEvidence(bundle, makeEvidence('stripe'));

    expect(updated.summary.evidence_count).toBe(1);
    expect(updated.summary.observed_amounts).toHaveLength(1);
    expect(updated.summary.observed_amounts[0].source).toBe('stripe');
  });
});

// ---------------------------------------------------------------------------
// addTimelineEntry / addReceiptRef
// ---------------------------------------------------------------------------

describe('addTimelineEntry', () => {
  it('should add and sort timeline entries', () => {
    let bundle = createCommerceEvidenceBundle({ transaction_ref: 'txn_1' });
    bundle = addTimelineEntry(bundle, makeTimeline('stripe', 'settled', '2025-01-15T13:00:00Z'));
    bundle = addTimelineEntry(bundle, makeTimeline('acp', 'created', '2025-01-15T12:00:00Z'));

    expect(bundle.timeline).toHaveLength(2);
    expect(bundle.timeline[0].source).toBe('acp');
    expect(bundle.timeline[1].source).toBe('stripe');
  });
});

describe('addReceiptRef', () => {
  it('should add receipt reference', () => {
    const bundle = createCommerceEvidenceBundle({ transaction_ref: 'txn_1' });
    const updated = addReceiptRef(bundle, 'sha256:abc123');

    expect(updated.receipts).toContain('sha256:abc123');
    expect(bundle.receipts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeCommerceSummary (non-aggregating)
// ---------------------------------------------------------------------------

describe('computeCommerceSummary', () => {
  it('should list observed amounts per source (not rolled up)', () => {
    const evidence = [
      makeEvidence('stripe', {
        amount_minor: '1000',
        currency: 'USD',
        commerce_event: 'settlement',
      }),
      makeEvidence('paymentauth', { amount_minor: '500', currency: 'USD' }),
    ];

    const summary = computeCommerceSummary(evidence);

    expect(summary.observed_amounts).toHaveLength(2);
    expect(summary.observed_amounts[0]).toEqual({
      source: 'stripe',
      amount: '1000',
      currency: 'USD',
      semantic_stage: 'settlement',
    });
    expect(summary.observed_amounts[1]).toEqual({
      source: 'paymentauth',
      amount: '500',
      currency: 'USD',
      semantic_stage: undefined,
    });
  });

  it('should NOT compute a rolled-up total', () => {
    const evidence = [
      makeEvidence('stripe', { amount_minor: '1000', currency: 'USD' }),
      makeEvidence('x402', { amount_minor: '2000', currency: 'USD' }),
    ];

    const summary = computeCommerceSummary(evidence);

    // No total field; only individual observations
    expect(summary.observed_amounts).toHaveLength(2);
    expect((summary as Record<string, unknown>).total).toBeUndefined();
  });

  it('should track currencies observed', () => {
    const evidence = [
      makeEvidence('stripe', { amount_minor: '1000', currency: 'usd' }),
      makeEvidence('x402', { amount_minor: '500', currency: 'eur' }),
    ];

    const summary = computeCommerceSummary(evidence);

    expect(summary.currencies_observed).toEqual(['EUR', 'USD']);
  });

  it('should track rails observed', () => {
    const evidence = [
      makeEvidence('stripe', { payment_rail: 'stripe' }),
      makeEvidence('paymentauth', { payment_rail: 'paymentauth' }),
    ];

    const summary = computeCommerceSummary(evidence);

    expect(summary.rails_observed).toContain('stripe');
    expect(summary.rails_observed).toContain('paymentauth');
  });

  it('should handle empty evidence', () => {
    const summary = computeCommerceSummary([]);

    expect(summary.observed_amounts).toEqual([]);
    expect(summary.currencies_observed).toEqual([]);
    expect(summary.rails_observed).toEqual([]);
    expect(summary.evidence_count).toBe(0);
  });

  it('should skip evidence without amount/currency', () => {
    const evidence = [
      makeEvidence('acp', { payment_rail: 'acp' }), // no amount_minor or currency
    ];

    // Override the default fixture data
    evidence[0].data = { payment_rail: 'acp' };

    const summary = computeCommerceSummary(evidence);

    expect(summary.observed_amounts).toEqual([]);
    expect(summary.rails_observed).toContain('acp');
  });
});

// ---------------------------------------------------------------------------
// serializeCommerceBundle
// ---------------------------------------------------------------------------

describe('serializeCommerceBundle', () => {
  it('should produce deterministic JSON with sorted keys', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_det',
      evidence: [makeEvidence('stripe')],
    });

    const json1 = serializeCommerceBundle(bundle);
    const json2 = serializeCommerceBundle(bundle);

    expect(json1).toBe(json2);
  });

  it('should be valid JSON', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_valid',
      evidence: [makeEvidence('stripe')],
      receipts: ['sha256:abc'],
    });

    const json = serializeCommerceBundle(bundle);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(COMMERCE_BUNDLE_VERSION);
    expect(parsed.transaction_ref).toBe('txn_valid');
  });

  it('should recursively sort nested object keys', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_nested',
      created_at: '2025-06-01T12:00:00Z',
      evidence: [
        {
          source: 'stripe',
          captured_at: '2025-06-01T12:00:00Z',
          data: {
            zebra_field: 'last',
            alpha_field: 'first',
            nested: { zz_inner: 'z', aa_inner: 'a' },
            payment_rail: 'stripe',
            amount_minor: '100',
            currency: 'USD',
          },
        },
      ],
    });

    const json = serializeCommerceBundle(bundle);
    const parsed = JSON.parse(json);

    // Top-level keys sorted
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());

    // Nested evidence data keys sorted
    const evidenceData = parsed.protocol_evidence[0].data;
    const dataKeys = Object.keys(evidenceData);
    expect(dataKeys).toEqual([...dataKeys].sort());

    // Deeply nested keys sorted
    const nestedKeys = Object.keys(evidenceData.nested);
    expect(nestedKeys).toEqual(['aa_inner', 'zz_inner']);

    // No nested fields dropped
    expect(evidenceData.zebra_field).toBe('last');
    expect(evidenceData.alpha_field).toBe('first');
    expect(evidenceData.nested.aa_inner).toBe('a');
    expect(evidenceData.nested.zz_inner).toBe('z');
  });

  it('should preserve arrays in order (not sort array elements)', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_array',
      created_at: '2025-06-01T12:00:00Z',
      receipts: ['sha256:ccc', 'sha256:aaa', 'sha256:bbb'],
    });

    const json = serializeCommerceBundle(bundle);
    const parsed = JSON.parse(json);

    // Array order preserved (not alphabetically sorted)
    expect(parsed.receipts).toEqual(['sha256:ccc', 'sha256:aaa', 'sha256:bbb']);
  });
});

// ---------------------------------------------------------------------------
// extractRails: explicit payment_rail only
// ---------------------------------------------------------------------------

describe('extractRails behavior', () => {
  it('should only use explicit payment_rail, not infer from source', () => {
    const bundle = createCommerceEvidenceBundle({
      transaction_ref: 'txn_rails',
      created_at: '2025-06-01T12:00:00Z',
      evidence: [
        {
          source: 'some-arbitrary-source',
          captured_at: '2025-06-01T12:00:00Z',
          data: { amount_minor: '100', currency: 'USD' },
        },
      ],
    });

    // No payment_rail in data, so rails_observed should be empty
    expect(bundle.rails_observed).toEqual([]);
  });
});
