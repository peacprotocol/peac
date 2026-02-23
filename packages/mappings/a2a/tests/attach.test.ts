import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import {
  attachReceiptToMetadata,
  attachReceiptToTaskStatus,
  attachReceiptToMessage,
  attachReceiptToArtifact,
  PEAC_EXTENSION_URI,
} from '../src/index';

// Test carrier with valid receipt_ref
const VALID_CARRIER: PeacEvidenceCarrier = {
  receipt_ref:
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as PeacEvidenceCarrier['receipt_ref'],
};

const VALID_CARRIER_WITH_JWS: PeacEvidenceCarrier = {
  receipt_ref:
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as PeacEvidenceCarrier['receipt_ref'],
  receipt_jws: 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.dGVzdHNpZw',
};

describe('attachReceiptToMetadata', () => {
  it('attaches carrier under PEAC_EXTENSION_URI key', () => {
    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [VALID_CARRIER]);

    expect(metadata[PEAC_EXTENSION_URI]).toBeDefined();
    const payload = metadata[PEAC_EXTENSION_URI] as { carriers: PeacEvidenceCarrier[] };
    expect(payload.carriers).toHaveLength(1);
    expect(payload.carriers[0].receipt_ref).toBe(VALID_CARRIER.receipt_ref);
  });

  it('includes CarrierMeta in payload', () => {
    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [VALID_CARRIER]);

    const payload = metadata[PEAC_EXTENSION_URI] as {
      carriers: PeacEvidenceCarrier[];
      meta: { transport: string };
    };
    expect(payload.meta.transport).toBe('a2a');
  });

  it('attaches multiple carriers', () => {
    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [VALID_CARRIER, VALID_CARRIER_WITH_JWS]);

    const payload = metadata[PEAC_EXTENSION_URI] as { carriers: PeacEvidenceCarrier[] };
    expect(payload.carriers).toHaveLength(2);
  });

  it('overwrites existing PEAC extension data', () => {
    const metadata: Record<string, unknown> = {
      [PEAC_EXTENSION_URI]: { old: 'data' },
    };
    attachReceiptToMetadata(metadata, [VALID_CARRIER]);

    const payload = metadata[PEAC_EXTENSION_URI] as { carriers: PeacEvidenceCarrier[] };
    expect(payload.carriers).toHaveLength(1);
    expect((payload as Record<string, unknown>).old).toBeUndefined();
  });

  it('throws on oversized carrier', () => {
    const oversized: PeacEvidenceCarrier = {
      ...VALID_CARRIER,
      policy_binding: 'x'.repeat(100_000),
    };
    expect(() => attachReceiptToMetadata({}, [oversized])).toThrow(/constraint violation/i);
  });

  it('accepts custom CarrierMeta', () => {
    const metadata: Record<string, unknown> = {};
    const customMeta = { transport: 'a2a', format: 'embed' as const, max_size: 1_000_000 };
    attachReceiptToMetadata(metadata, [VALID_CARRIER], customMeta);

    const payload = metadata[PEAC_EXTENSION_URI] as {
      meta: { max_size: number };
    };
    expect(payload.meta.max_size).toBe(1_000_000);
  });
});

describe('attachReceiptToTaskStatus', () => {
  it('attaches carrier to TaskStatus', () => {
    const status = { state: 'completed' };
    const result = attachReceiptToTaskStatus(status, [VALID_CARRIER]);

    expect(result.metadata).toBeDefined();
    expect(result.metadata![PEAC_EXTENSION_URI]).toBeDefined();
  });

  it('initializes metadata if absent', () => {
    const status = { state: 'working' };
    attachReceiptToTaskStatus(status, [VALID_CARRIER]);
    expect(status.metadata).toBeDefined();
  });

  it('preserves existing metadata fields', () => {
    const status = { state: 'completed', metadata: { existing: 'value' } };
    attachReceiptToTaskStatus(status, [VALID_CARRIER]);

    expect(status.metadata.existing).toBe('value');
    expect(status.metadata[PEAC_EXTENSION_URI]).toBeDefined();
  });
});

describe('attachReceiptToMessage', () => {
  it('attaches carrier to Message', () => {
    const msg = { role: 'agent', parts: [{ text: 'hello' }] };
    const result = attachReceiptToMessage(msg, [VALID_CARRIER]);

    expect(result.metadata).toBeDefined();
    expect(result.metadata![PEAC_EXTENSION_URI]).toBeDefined();
  });
});

describe('attachReceiptToArtifact', () => {
  it('attaches carrier to Artifact', () => {
    const artifact = { artifactId: 'art-1', parts: [{ text: 'data' }] };
    const result = attachReceiptToArtifact(artifact, [VALID_CARRIER]);

    expect(result.metadata).toBeDefined();
    expect(result.metadata![PEAC_EXTENSION_URI]).toBeDefined();
  });
});
