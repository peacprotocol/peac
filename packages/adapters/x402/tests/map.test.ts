import { describe, it, expect } from 'vitest';
import { toPeacRecord, X402Error, X402_OFFER_RECEIPT_PROFILE } from '../src/index.js';
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
