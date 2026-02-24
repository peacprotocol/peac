import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier, CarrierMeta } from '@peac/kernel';
import { A2ACarrierAdapter, createA2ACarrierMeta, PEAC_EXTENSION_URI } from '../src/index';

const VALID_REF = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const VALID_CARRIER: PeacEvidenceCarrier = {
  receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
};

describe('A2ACarrierAdapter', () => {
  const adapter = new A2ACarrierAdapter();

  it('round-trips: attach then extract returns identical carrier', () => {
    const status = { state: 'completed' };
    const attached = adapter.attach(status, [VALID_CARRIER]);

    const extracted = adapter.extract(attached);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts).toHaveLength(1);
    expect(extracted!.receipts[0].receipt_ref).toBe(VALID_CARRIER.receipt_ref);
  });

  it('round-trips receipt_url through attach and extract (DD-135)', () => {
    const carrierWithUrl: PeacEvidenceCarrier = {
      ...VALID_CARRIER,
      receipt_url: 'https://receipts.example.com/abc123',
    };
    const status = { state: 'completed' };
    const attached = adapter.attach(status, [carrierWithUrl]);

    const extracted = adapter.extract(attached);
    expect(extracted).not.toBeNull();
    expect(extracted!.receipts[0].receipt_url).toBe('https://receipts.example.com/abc123');
  });

  it('extract returns null when no carrier present', () => {
    expect(adapter.extract({ state: 'working' })).toBeNull();
  });

  it('attach initializes metadata', () => {
    const status = { state: 'idle' };
    adapter.attach(status, [VALID_CARRIER]);
    expect(status.metadata).toBeDefined();
    expect((status.metadata as Record<string, unknown>)[PEAC_EXTENSION_URI]).toBeDefined();
  });

  it('validateConstraints passes for valid carrier', () => {
    const meta = createA2ACarrierMeta();
    const result = adapter.validateConstraints(VALID_CARRIER, meta);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('validateConstraints fails for invalid receipt_ref', () => {
    const bad: PeacEvidenceCarrier = {
      receipt_ref: 'not-a-valid-ref' as PeacEvidenceCarrier['receipt_ref'],
    };
    const meta = createA2ACarrierMeta();
    const result = adapter.validateConstraints(bad, meta);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('validateConstraints fails for oversized carrier', () => {
    const oversized: PeacEvidenceCarrier = {
      ...VALID_CARRIER,
      policy_binding: 'x'.repeat(100_000),
    };
    const meta = createA2ACarrierMeta({ max_size: 1_000 });
    const result = adapter.validateConstraints(oversized, meta);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('size'))).toBe(true);
  });
});

describe('createA2ACarrierMeta', () => {
  it('creates default A2A meta', () => {
    const meta = createA2ACarrierMeta();
    expect(meta.transport).toBe('a2a');
    expect(meta.format).toBe('embed');
    expect(meta.max_size).toBe(65_536);
  });

  it('accepts overrides', () => {
    const meta = createA2ACarrierMeta({ format: 'reference', max_size: 8_192 });
    expect(meta.transport).toBe('a2a');
    expect(meta.format).toBe('reference');
    expect(meta.max_size).toBe(8_192);
  });
});
