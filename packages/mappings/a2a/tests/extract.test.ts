import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import { computeReceiptRef } from '@peac/schema';
import {
  extractReceiptFromMetadata,
  extractReceiptFromMetadataAsync,
  extractReceiptFromTaskStatus,
  extractReceiptFromTaskStatusAsync,
  extractReceiptFromMessage,
  extractReceiptFromArtifact,
  attachReceiptToMetadata,
  PEAC_EXTENSION_URI,
} from '../src/index';

const VALID_REF = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VALID_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJ0ZXN0In0.dGVzdHNpZw';

const VALID_CARRIER: PeacEvidenceCarrier = {
  receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
};

describe('extractReceiptFromMetadata (sync)', () => {
  it('extracts carrier from properly structured metadata', () => {
    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [VALID_CARRIER]);

    const result = extractReceiptFromMetadata(metadata);
    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toBe(VALID_REF);
    expect(result!.meta.transport).toBe('a2a');
  });

  it('returns null for empty metadata', () => {
    expect(extractReceiptFromMetadata({})).toBeNull();
  });

  it('returns null when PEAC extension key is missing', () => {
    expect(extractReceiptFromMetadata({ other: 'data' })).toBeNull();
  });

  it('returns null when PEAC extension is null', () => {
    expect(extractReceiptFromMetadata({ [PEAC_EXTENSION_URI]: null })).toBeNull();
  });

  it('returns null when carriers array is empty', () => {
    const metadata = { [PEAC_EXTENSION_URI]: { carriers: [] } };
    expect(extractReceiptFromMetadata(metadata)).toBeNull();
  });

  it('returns null when payload has no carriers key', () => {
    const metadata = { [PEAC_EXTENSION_URI]: { data: 'no carriers' } };
    expect(extractReceiptFromMetadata(metadata)).toBeNull();
  });

  it('skips carriers that fail schema validation (DD-131)', () => {
    const metadata = {
      [PEAC_EXTENSION_URI]: {
        carriers: [
          { receipt_ref: 'invalid-ref' }, // bad format
          { receipt_ref: VALID_REF }, // valid
        ],
      },
    };

    const result = extractReceiptFromMetadata(metadata);
    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.receipts[0].receipt_ref).toBe(VALID_REF);
  });

  it('returns null when all carriers fail validation', () => {
    const metadata = {
      [PEAC_EXTENSION_URI]: {
        carriers: [{ receipt_ref: 'bad1' }, { receipt_ref: 'bad2' }],
      },
    };

    expect(extractReceiptFromMetadata(metadata)).toBeNull();
  });
});

describe('extractReceiptFromMetadataAsync (DD-129)', () => {
  it('passes with consistent receipt_ref and receipt_jws', async () => {
    const jws = VALID_JWS;
    const ref = await computeReceiptRef(jws);

    const carrier: PeacEvidenceCarrier = {
      receipt_ref: ref,
      receipt_jws: jws,
    };

    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [carrier]);

    const result = await extractReceiptFromMetadataAsync(metadata);
    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.violations).toHaveLength(0);
  });

  it('reports violation for inconsistent receipt_ref (tampered carrier)', async () => {
    const carrier: PeacEvidenceCarrier = {
      receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
      receipt_jws: VALID_JWS, // receipt_ref does NOT match sha256(receipt_jws)
    };

    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [carrier]);

    const result = await extractReceiptFromMetadataAsync(metadata);
    expect(result).not.toBeNull();
    expect(result!.violations.length).toBeGreaterThan(0);
    expect(result!.violations[0]).toContain('receipt_ref mismatch');
  });

  it('passes for carrier without receipt_jws (no consistency check needed)', async () => {
    const metadata: Record<string, unknown> = {};
    attachReceiptToMetadata(metadata, [VALID_CARRIER]);

    const result = await extractReceiptFromMetadataAsync(metadata);
    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
    expect(result!.violations).toHaveLength(0);
  });

  it('returns null for empty metadata', async () => {
    expect(await extractReceiptFromMetadataAsync({})).toBeNull();
  });
});

describe('extractReceiptFromTaskStatus', () => {
  it('extracts from TaskStatus with metadata', () => {
    const status = { state: 'completed', metadata: {} as Record<string, unknown> };
    attachReceiptToMetadata(status.metadata, [VALID_CARRIER]);

    const result = extractReceiptFromTaskStatus(status);
    expect(result).not.toBeNull();
    expect(result!.receipts).toHaveLength(1);
  });

  it('returns null for TaskStatus without metadata', () => {
    expect(extractReceiptFromTaskStatus({ state: 'working' })).toBeNull();
  });
});

describe('extractReceiptFromTaskStatusAsync', () => {
  it('extracts with consistency check from TaskStatus', async () => {
    const jws = VALID_JWS;
    const ref = await computeReceiptRef(jws);
    const carrier: PeacEvidenceCarrier = { receipt_ref: ref, receipt_jws: jws };

    const status = { state: 'completed', metadata: {} as Record<string, unknown> };
    attachReceiptToMetadata(status.metadata, [carrier]);

    const result = await extractReceiptFromTaskStatusAsync(status);
    expect(result).not.toBeNull();
    expect(result!.violations).toHaveLength(0);
  });
});

describe('extractReceiptFromMessage', () => {
  it('extracts from Message with metadata', () => {
    const msg = {
      role: 'agent',
      parts: [],
      metadata: {} as Record<string, unknown>,
    };
    attachReceiptToMetadata(msg.metadata, [VALID_CARRIER]);

    const result = extractReceiptFromMessage(msg);
    expect(result).not.toBeNull();
  });

  it('returns null for Message without metadata', () => {
    expect(extractReceiptFromMessage({ role: 'agent', parts: [] })).toBeNull();
  });
});

describe('extractReceiptFromArtifact', () => {
  it('extracts from Artifact with metadata', () => {
    const artifact = {
      artifactId: 'art-1',
      parts: [],
      metadata: {} as Record<string, unknown>,
    };
    attachReceiptToMetadata(artifact.metadata, [VALID_CARRIER]);

    const result = extractReceiptFromArtifact(artifact);
    expect(result).not.toBeNull();
  });

  it('returns null for Artifact without metadata', () => {
    expect(extractReceiptFromArtifact({ artifactId: 'art-1', parts: [] })).toBeNull();
  });
});
