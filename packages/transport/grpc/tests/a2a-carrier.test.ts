import { describe, it, expect } from 'vitest';
import type { PeacEvidenceCarrier } from '@peac/kernel';
import {
  A2AGrpcCarrierAdapter,
  createGrpcCarrierMeta,
  validateOwnMetadataKeys,
  GRPC_MAX_CARRIER_SIZE,
  GrpcMetadataKeys,
  addReceiptToMetadata,
  extractReceiptTypeFromMetadata,
  GRPC_TRANSPORT_VERSION,
} from '../src/index.js';

const VALID_REF = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const VALID_CARRIER: PeacEvidenceCarrier = {
  receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
  receipt_jws: 'eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3QifQ.eyJpc3MiOiJ0ZXN0In0.dGVzdA',
};

describe('A2AGrpcCarrierAdapter', () => {
  const adapter = new A2AGrpcCarrierAdapter();

  describe('attach + extract round-trip', () => {
    it('round-trips: attach then extract returns receipt JWS', () => {
      const metadata: Record<string, string | string[] | undefined> = {};
      const attached = adapter.attach(metadata, [VALID_CARRIER]);

      const extracted = adapter.extract(attached);
      expect(extracted).not.toBeNull();
      expect(extracted!.receipts).toHaveLength(1);
      expect(extracted!.receipts[0].receipt_jws).toBe(VALID_CARRIER.receipt_jws);
    });

    it('computes real SHA-256 receipt_ref (not a placeholder)', () => {
      const metadata: Record<string, string | string[] | undefined> = {};
      adapter.attach(metadata, [VALID_CARRIER]);

      const extracted = adapter.extract(metadata);
      expect(extracted).not.toBeNull();
      const ref = extracted!.receipts[0].receipt_ref;
      expect(ref).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(ref).not.toBe('sha256:' + '0'.repeat(64));
    });

    it('uses first carrier when multiple provided', () => {
      const second: PeacEvidenceCarrier = {
        receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
        receipt_jws: 'eyJzZWNvbmQifQ.eyJ0ZXN0In0.c2Vjb25k',
      };
      const metadata: Record<string, string | string[] | undefined> = {};
      adapter.attach(metadata, [VALID_CARRIER, second]);

      expect(metadata[GrpcMetadataKeys.RECEIPT]).toBe(VALID_CARRIER.receipt_jws);
    });
  });

  describe('extract', () => {
    it('returns null when no receipt in metadata', () => {
      expect(adapter.extract({})).toBeNull();
    });

    it('returns null when receipt key is undefined', () => {
      expect(adapter.extract({ [GrpcMetadataKeys.RECEIPT]: undefined })).toBeNull();
    });

    it('extracts from string metadata value', () => {
      const metadata = { [GrpcMetadataKeys.RECEIPT]: VALID_CARRIER.receipt_jws! };
      const result = adapter.extract(metadata);
      expect(result).not.toBeNull();
      expect(result!.receipts[0].receipt_jws).toBe(VALID_CARRIER.receipt_jws);
    });

    it('extracts first value from array metadata', () => {
      const metadata = { [GrpcMetadataKeys.RECEIPT]: [VALID_CARRIER.receipt_jws!] };
      const result = adapter.extract(metadata);
      expect(result).not.toBeNull();
      expect(result!.receipts[0].receipt_jws).toBe(VALID_CARRIER.receipt_jws);
    });

    it('returns grpc transport meta with 8 KiB default', () => {
      const metadata = { [GrpcMetadataKeys.RECEIPT]: VALID_CARRIER.receipt_jws! };
      const result = adapter.extract(metadata);
      expect(result!.meta.transport).toBe('grpc');
      expect(result!.meta.format).toBe('embed');
      expect(result!.meta.max_size).toBe(8_192);
    });

    it('rejects binary metadata key (peac-receipt-bin)', () => {
      const metadata = {
        [GrpcMetadataKeys.RECEIPT]: VALID_CARRIER.receipt_jws!,
        'peac-receipt-bin': 'binary-data',
      };
      const result = adapter.extract(metadata);
      expect(result).toBeNull();
    });
  });

  describe('attach', () => {
    it('returns metadata unchanged when no carriers', () => {
      const metadata = { existing: 'value' };
      const result = adapter.attach(metadata, []);
      expect(result).toBe(metadata);
      expect(result[GrpcMetadataKeys.RECEIPT]).toBeUndefined();
    });

    it('throws on carrier exceeding 8 KiB size limit', () => {
      const oversized: PeacEvidenceCarrier = {
        receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
        receipt_jws: 'x'.repeat(10_000),
      };
      expect(() => adapter.attach({}, [oversized])).toThrow(/constraint violation/i);
    });

    it('sets receipt type metadata key', () => {
      const metadata: Record<string, string | string[] | undefined> = {};
      adapter.attach(metadata, [VALID_CARRIER]);
      expect(metadata[GrpcMetadataKeys.RECEIPT_TYPE]).toBe('interaction-record+jwt');
    });
  });

  describe('validateConstraints', () => {
    it('returns valid for well-formed carrier within 8 KiB', () => {
      const meta = createGrpcCarrierMeta();
      const result = adapter.validateConstraints(VALID_CARRIER, meta);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('returns invalid for oversized carrier', () => {
      const oversized: PeacEvidenceCarrier = {
        receipt_ref: VALID_REF as PeacEvidenceCarrier['receipt_ref'],
        receipt_jws: 'x'.repeat(10_000),
      };
      const meta = createGrpcCarrierMeta();
      const result = adapter.validateConstraints(oversized, meta);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('passes with explicit larger size override for valid carrier', () => {
      const meta = createGrpcCarrierMeta({ max_size: 65_536 });
      const result = adapter.validateConstraints(VALID_CARRIER, meta);
      expect(result.valid).toBe(true);
    });
  });
});

describe('createGrpcCarrierMeta()', () => {
  it('creates default grpc meta with 8 KiB limit', () => {
    const meta = createGrpcCarrierMeta();
    expect(meta.transport).toBe('grpc');
    expect(meta.format).toBe('embed');
    expect(meta.max_size).toBe(8_192);
  });

  it('accepts overrides', () => {
    const meta = createGrpcCarrierMeta({ format: 'reference', max_size: 65_536 });
    expect(meta.transport).toBe('grpc');
    expect(meta.format).toBe('reference');
    expect(meta.max_size).toBe(65_536);
  });
});

describe('GRPC_MAX_CARRIER_SIZE', () => {
  it('is 8 KiB (HTTP/2 header budget)', () => {
    expect(GRPC_MAX_CARRIER_SIZE).toBe(8_192);
  });
});

describe('validateOwnMetadataKeys()', () => {
  it('validates all PEAC metadata key constants are ASCII-safe', () => {
    const invalid = validateOwnMetadataKeys();
    expect(invalid).toHaveLength(0);
  });
});

describe('addReceiptToMetadata() Wire 0.2 default', () => {
  it('defaults receipt type to interaction-record+jwt (Wire 0.2)', () => {
    const metadata: Record<string, string | string[]> = {};
    addReceiptToMetadata(metadata, 'eyJ...');
    expect(metadata[GrpcMetadataKeys.RECEIPT]).toBe('eyJ...');
    expect(metadata[GrpcMetadataKeys.RECEIPT_TYPE]).toBe('interaction-record+jwt');
  });

  it('accepts explicit Wire 0.1 receipt type', () => {
    const metadata: Record<string, string | string[]> = {};
    addReceiptToMetadata(metadata, 'eyJ...', 'peac-receipt/0.1');
    expect(metadata[GrpcMetadataKeys.RECEIPT_TYPE]).toBe('peac-receipt/0.1');
  });
});

describe('extractReceiptTypeFromMetadata()', () => {
  it('extracts string receipt type', () => {
    const metadata = { [GrpcMetadataKeys.RECEIPT_TYPE]: 'interaction-record+jwt' };
    expect(extractReceiptTypeFromMetadata(metadata)).toBe('interaction-record+jwt');
  });

  it('returns null when absent', () => {
    expect(extractReceiptTypeFromMetadata({})).toBeNull();
  });
});

describe('GRPC_TRANSPORT_VERSION', () => {
  it('reports 0.12.6', () => {
    expect(GRPC_TRANSPORT_VERSION).toBe('0.12.6');
  });
});
