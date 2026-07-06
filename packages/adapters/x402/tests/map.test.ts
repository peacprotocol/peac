import { describe, it, expect } from 'vitest';
import { canonicalize } from '@peac/crypto';
import { computeJsonDocumentDigestJcs } from '@peac/protocol';
import {
  toPeacRecord,
  X402Error,
  X402_OFFER_RECEIPT_PROFILE,
  MAX_SETTLEMENT_EXTENSIONS_BYTES,
} from '../src/index.js';
import type {
  X402OfferReceiptChallenge,
  X402SettlementResponse,
  RawEIP712SignedOffer,
  RawEIP712SignedReceipt,
} from '../src/index.js';
import {
  PAYMENT_REQUIRED_VALID,
  PAYMENT_REQUIRED_NO_INDEX,
  SETTLEMENT_RESPONSE_VALID,
  OFFER_PAYLOAD_VALID,
  RECEIPT_PAYLOAD_VALID,
  SIG_EIP712,
} from './fixtures/index.js';

// ---------------------------------------------------------------------------
// toPeacRecord
// ---------------------------------------------------------------------------

describe('toPeacRecord', () => {
  describe('valid mapping', () => {
    it('should produce a valid PEAC record from x402 flow', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);

      expect(record.version).toBe(X402_OFFER_RECEIPT_PROFILE);

      // Proofs preserved (exact raw artifacts)
      expect(record.proofs.x402.offer).toEqual(PAYMENT_REQUIRED_VALID.offers[0]);
      expect(record.proofs.x402.receipt).toEqual(SETTLEMENT_RESPONSE_VALID.receipt);

      // Evidence extracted from signed payloads (normalized, Layer B)
      expect(record.evidence.resourceUrl).toBe('https://api.example.com/weather/london');
      expect(record.evidence.validUntil).toBe(OFFER_PAYLOAD_VALID.validUntil);
      expect(record.evidence.network).toBe('eip155:8453');
      expect(record.evidence.payee).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(record.evidence.asset).toBe('USDC');
      expect(record.evidence.amount).toBe('1000000');
      expect(record.evidence.offerVersion).toBe(1);

      // Receipt evidence
      expect(record.evidence.payer).toBe(RECEIPT_PAYLOAD_VALID.payer);
      expect(record.evidence.issuedAt).toBe(RECEIPT_PAYLOAD_VALID.issuedAt);
      expect(record.evidence.transaction).toBe(RECEIPT_PAYLOAD_VALID.transaction);
      expect(record.evidence.receiptVersion).toBe(1);

      // Hints
      expect(record.hints.acceptIndex).toEqual({
        value: 0,
        untrusted: true,
      });
      expect(record.hints.resourceUrl).toBe('https://api.example.com/weather/london');

      // Metadata
      expect(record.createdAt).toBeDefined();
      expect(new Date(record.createdAt).getTime()).not.toBeNaN();
    });

    it('should omit acceptIndex hint when not present on offer', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_NO_INDEX, SETTLEMENT_RESPONSE_VALID);
      expect(record.hints.acceptIndex).toBeUndefined();
    });

    it('should use paymentRequired resourceUrl over settlement', () => {
      const pr: X402OfferReceiptChallenge = {
        ...PAYMENT_REQUIRED_VALID,
        resourceUrl: 'https://api.example.com/from-pr',
      };
      const sr: X402SettlementResponse = {
        ...SETTLEMENT_RESPONSE_VALID,
        resourceUrl: 'https://api.example.com/from-sr',
      };
      const record = toPeacRecord(pr, sr);
      expect(record.hints.resourceUrl).toBe('https://api.example.com/from-pr');
    });

    it('should fall back to settlement resourceUrl', () => {
      const pr: X402OfferReceiptChallenge = {
        ...PAYMENT_REQUIRED_VALID,
        resourceUrl: undefined,
      };
      const record = toPeacRecord(pr, SETTLEMENT_RESPONSE_VALID);
      expect(record.hints.resourceUrl).toBe('https://api.example.com/weather/london');
    });

    it('should omit resourceUrl hint when neither has it', () => {
      const pr: X402OfferReceiptChallenge = {
        ...PAYMENT_REQUIRED_VALID,
        resourceUrl: undefined,
      };
      const sr: X402SettlementResponse = {
        ...SETTLEMENT_RESPONSE_VALID,
        resourceUrl: undefined,
      };
      const record = toPeacRecord(pr, sr);
      expect(record.hints.resourceUrl).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw on missing offers array', () => {
      const pr = {
        accepts: [],
        offers: [],
      } as unknown as X402OfferReceiptChallenge;

      expect(() => toPeacRecord(pr, SETTLEMENT_RESPONSE_VALID)).toThrow(X402Error);
    });

    it('should throw on missing receipt', () => {
      const sr = {} as unknown as X402SettlementResponse;

      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, sr)).toThrow(X402Error);
    });

    it('should throw on offerIndex out of range', () => {
      expect(() =>
        toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID, { offerIndex: 5 })
      ).toThrow(X402Error);
    });
  });

  describe('record structure', () => {
    it('should have correct version', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);
      expect(record.version).toBe(X402_OFFER_RECEIPT_PROFILE);
    });

    it('should not include digest by default', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);
      expect(record.digest).toBeUndefined();
    });

    it('should include createdAt as ISO 8601', () => {
      const before = new Date().toISOString();
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);
      const after = new Date().toISOString();

      expect(record.createdAt >= before).toBe(true);
      expect(record.createdAt <= after).toBe(true);
    });

    it('should preserve raw proofs for audit (proof preservation discipline)', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);

      // Proofs should be the exact same objects (never mutated)
      expect(record.proofs.x402.offer).toBe(PAYMENT_REQUIRED_VALID.offers[0]);
      expect(record.proofs.x402.receipt).toBe(SETTLEMENT_RESPONSE_VALID.receipt);
    });

    it('should mark acceptIndex as untrusted', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);
      expect(record.hints.acceptIndex?.untrusted).toBe(true);
    });

    it('should omit validUntil from evidence when normalized to absent', () => {
      // EIP-712 placeholder: validUntil = 0 -> normalized to undefined
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: 0 },
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      const pr: X402OfferReceiptChallenge = {
        ...PAYMENT_REQUIRED_VALID,
        offers: [offer],
      };
      const record = toPeacRecord(pr, SETTLEMENT_RESPONSE_VALID);
      expect(record.evidence.validUntil).toBeUndefined();
    });

    it('should omit transaction from evidence when normalized to absent', () => {
      // EIP-712 placeholder: transaction = "" -> normalized to undefined
      const receipt: RawEIP712SignedReceipt = {
        format: 'eip712',
        payload: { ...RECEIPT_PAYLOAD_VALID, transaction: '' },
        signature: SIG_EIP712,
      };
      const sr: X402SettlementResponse = {
        ...SETTLEMENT_RESPONSE_VALID,
        receipt,
      };
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, sr);
      expect(record.evidence.transaction).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// settlement extensions (proofs.x402)
// ---------------------------------------------------------------------------

describe('toPeacRecord: settlement extensions', () => {
  const EXTENSIONS_SIMPLE = { foo: 'bar', nested: { z: 1, a: 2 } };

  function withExtensions(extensions: Record<string, unknown> | undefined): X402SettlementResponse {
    return { ...SETTLEMENT_RESPONSE_VALID, extensions };
  }

  describe('default (digest-only, additive)', () => {
    it('is byte-identical to the pre-existing shape when extensions is absent', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, SETTLEMENT_RESPONSE_VALID);
      expect(Object.keys(record.proofs.x402).sort()).toEqual(['offer', 'receipt']);
      expect(record.proofs.x402.settlementExtensionsDigest).toBeUndefined();
      expect(record.proofs.x402.settlementExtensions).toBeUndefined();
    });

    it('adds settlementExtensionsDigest and omits raw by default', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE));
      expect(record.proofs.x402.settlementExtensionsDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(record.proofs.x402.settlementExtensions).toBeUndefined();
    });

    it('matches computeJsonDocumentDigestJcs computed over the same extensions object', async () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE));
      const expected = await computeJsonDocumentDigestJcs(EXTENSIONS_SIMPLE);
      expect(record.proofs.x402.settlementExtensionsDigest).toBe(expected);
    });

    it('digest is stable across key-order permutations (JCS canonicalization)', () => {
      const a = { x: 1, y: 2, z: { b: 2, a: 1 } };
      const b = { z: { a: 1, b: 2 }, y: 2, x: 1 };
      const recordA = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(a));
      const recordB = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(b));
      expect(recordA.proofs.x402.settlementExtensionsDigest).toBe(
        recordB.proofs.x402.settlementExtensionsDigest
      );
    });

    it('never places settlement extension data under evidence', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE));
      expect(record.evidence).not.toHaveProperty('settlementExtensions');
      expect(record.evidence).not.toHaveProperty('settlementExtensionsDigest');
    });
  });

  describe('DoS bound (UTF-8 bytes, not char count)', () => {
    it('throws settlement_extensions_too_large when canonical bytes exceed the limit', () => {
      const big = { blob: 'a'.repeat(MAX_SETTLEMENT_EXTENSIONS_BYTES + 100) };
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(big))).toThrow(X402Error);
      try {
        toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(big));
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_too_large');
      }
    });

    it('uses UTF-8 byte length (not JS string length) for the bound: multi-byte payload over the boundary', () => {
      // Each '€' (euro sign) is 1 UTF-16 code unit but 3 UTF-8 bytes.
      const charCount = Math.floor(MAX_SETTLEMENT_EXTENSIONS_BYTES / 2);
      const multiByte = { blob: '€'.repeat(charCount) };
      const canonical = canonicalize(multiByte);
      // Char length alone would be well under the byte limit...
      expect(canonical.length).toBeLessThan(MAX_SETTLEMENT_EXTENSIONS_BYTES);
      // ...but the UTF-8 byte length exceeds it.
      expect(Buffer.byteLength(canonical, 'utf8')).toBeGreaterThan(MAX_SETTLEMENT_EXTENSIONS_BYTES);
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(multiByte))).toThrow(
        X402Error
      );
    });

    it('accepts a multi-byte payload sized within the byte bound (boundary, not over it)', () => {
      const charCount = Math.floor((MAX_SETTLEMENT_EXTENSIONS_BYTES - 100) / 3);
      const multiByte = { blob: '€'.repeat(charCount) };
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(multiByte))).not.toThrow();
    });
  });

  describe('opt-in raw preservation', () => {
    it('adds proofs.x402.settlementExtensions only when preserveRawSettlementExtensions is true', () => {
      const withoutOptIn = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE));
      expect(withoutOptIn.proofs.x402.settlementExtensions).toBeUndefined();

      const withOptIn = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE), {
        preserveRawSettlementExtensions: true,
      });
      expect(withOptIn.proofs.x402.settlementExtensions).toEqual(EXTENSIONS_SIMPLE);
    });

    it('preserves a clone derived from the bounded canonical bytes, not the caller object reference', () => {
      const extensions = { mutable: 'original' };
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(extensions), {
        preserveRawSettlementExtensions: true,
      });
      expect(record.proofs.x402.settlementExtensions).not.toBe(extensions);
      expect(record.proofs.x402.settlementExtensions).toEqual({ mutable: 'original' });

      extensions.mutable = 'changed-after-mapping';
      expect((record.proofs.x402.settlementExtensions as Record<string, unknown>).mutable).toBe(
        'original'
      );
    });
  });

  describe('receipt consistency guard', () => {
    it('allows a matching embedded receipt (no throw)', () => {
      const sr = withExtensions({
        'offer-receipt': { info: { receipt: SETTLEMENT_RESPONSE_VALID.receipt } },
      });
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, sr)).not.toThrow();
    });

    it('throws settlement_extensions_invalid when the embedded receipt conflicts with proofs.x402.receipt', () => {
      const differentReceipt: RawEIP712SignedReceipt = {
        format: 'eip712',
        payload: { ...RECEIPT_PAYLOAD_VALID, payer: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
        signature: SIG_EIP712,
      };
      const sr = withExtensions({
        'offer-receipt': { info: { receipt: differentReceipt } },
      });
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, sr)).toThrow(X402Error);
      try {
        toPeacRecord(PAYMENT_REQUIRED_VALID, sr);
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_invalid');
      }
    });
  });

  describe('serialization lock', () => {
    it('proofs.x402 keys are exactly offer/receipt/settlementExtensionsDigest by default (camelCase)', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE));
      expect(Object.keys(record.proofs.x402).sort()).toEqual(
        ['offer', 'receipt', 'settlementExtensionsDigest'].sort()
      );
    });

    it('proofs.x402 keys additionally include settlementExtensions when opted in (camelCase)', () => {
      const record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(EXTENSIONS_SIMPLE), {
        preserveRawSettlementExtensions: true,
      });
      expect(Object.keys(record.proofs.x402).sort()).toEqual(
        ['offer', 'receipt', 'settlementExtensions', 'settlementExtensionsDigest'].sort()
      );
    });
  });

  describe('canonicalization failures (JSON-canonicalizable guard)', () => {
    it('throws settlement_extensions_invalid for a cyclic extensions object', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(cyclic))).toThrow(X402Error);
      try {
        toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(cyclic));
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_invalid');
        // The raw extension value must not leak into the error message.
        expect((err as X402Error).message).toBe(
          'Settlement extensions must be JSON-canonicalizable'
        );
      }
    });

    it('throws settlement_extensions_invalid for a BigInt value inside extensions', () => {
      const withBigInt = { amount: BigInt(1) } as unknown as Record<string, unknown>;
      expect(() => toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(withBigInt))).toThrow(
        X402Error
      );
      try {
        toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(withBigInt));
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_invalid');
      }
    });

    it('does not emit or partially populate a record when canonicalization fails', () => {
      // toPeacRecord throws before returning; there is no partial record.
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      let record: unknown;
      expect(() => {
        record = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(cyclic));
      }).toThrow(X402Error);
      expect(record).toBeUndefined();
    });

    it('omits undefined object-member values per RFC 8785 / JSON.stringify (locked behavior, not an error)', () => {
      // canonicalize drops undefined members (documented PROTOCOL DECISION),
      // so { a: 1, b: undefined } digests identically to { a: 1 }.
      const withUndefined = { a: 1, b: undefined } as Record<string, unknown>;
      const recordU = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions(withUndefined));
      const recordPlain = toPeacRecord(PAYMENT_REQUIRED_VALID, withExtensions({ a: 1 }));
      expect(recordU.proofs.x402.settlementExtensionsDigest).toBe(
        recordPlain.proofs.x402.settlementExtensionsDigest
      );
    });
  });
});
