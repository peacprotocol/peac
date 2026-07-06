/**
 * Tests for extractSignedReceiptFromSettlement() and
 * MAX_SETTLEMENT_EXTENSIONS_BYTES (settlement-extensions.ts).
 */

import { describe, it, expect } from 'vitest';
import {
  extractSignedReceiptFromSettlement,
  MAX_SETTLEMENT_EXTENSIONS_BYTES,
  X402Error,
} from '../src/index.js';
import { RECEIPT_PAYLOAD_VALID, SIG_EIP712 } from './fixtures/index.js';

// A structurally valid compact JWS (3 unpadded base64url segments; header
// and payload both decode to plain JSON objects). Reused from
// tests/carrier.test.ts's SAMPLE_JWS fixture pattern.
const VALID_JWS = 'eyJhbGciOiJFZERTQSJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSJ9.c2lnbmF0dXJl';

describe('MAX_SETTLEMENT_EXTENSIONS_BYTES', () => {
  it('is 256 KiB', () => {
    expect(MAX_SETTLEMENT_EXTENSIONS_BYTES).toBe(256 * 1024);
  });
});

describe('extractSignedReceiptFromSettlement', () => {
  describe('happy paths', () => {
    it('extracts a JWS-format receipt', () => {
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': {
            info: {
              receipt: { format: 'jws', signature: VALID_JWS },
            },
          },
        },
      };
      expect(extractSignedReceiptFromSettlement(settlement)).toEqual({
        format: 'jws',
        signature: VALID_JWS,
      });
    });

    it('extracts an EIP-712-format receipt', () => {
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': {
            info: {
              receipt: { format: 'eip712', payload: RECEIPT_PAYLOAD_VALID, signature: SIG_EIP712 },
            },
          },
        },
      };
      expect(extractSignedReceiptFromSettlement(settlement)).toEqual({
        format: 'eip712',
        payload: RECEIPT_PAYLOAD_VALID,
        signature: SIG_EIP712,
      });
    });

    it('extracts a receipt when info carries no offers key at all (settlement-only shape)', () => {
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': {
            info: { receipt: { format: 'jws', signature: VALID_JWS } },
          },
        },
      };
      expect(extractSignedReceiptFromSettlement(settlement)).not.toBeNull();
    });

    it('extracts a receipt when info carries an empty offers array (documented challenge-side shape)', () => {
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': {
            info: { offers: [], receipt: { format: 'jws', signature: VALID_JWS } },
          },
        },
      };
      expect(extractSignedReceiptFromSettlement(settlement)).toEqual({
        format: 'jws',
        signature: VALID_JWS,
      });
    });

    it('does not verify the returned artifact (extraction only)', () => {
      // The signature is structurally valid but not cryptographically
      // meaningful; the helper still returns it without attempting any
      // verification.
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': { info: { receipt: { format: 'jws', signature: VALID_JWS } } },
        },
      };
      const result = extractSignedReceiptFromSettlement(settlement);
      expect(result).not.toBeNull();
      expect(result).toEqual({ format: 'jws', signature: VALID_JWS });
    });
  });

  describe('tolerant absence (returns null)', () => {
    it('returns null for an absent/undefined settlement', () => {
      expect(extractSignedReceiptFromSettlement(undefined)).toBeNull();
    });

    it('returns null for a non-object settlement', () => {
      expect(extractSignedReceiptFromSettlement('not-an-object')).toBeNull();
      expect(extractSignedReceiptFromSettlement(42)).toBeNull();
      expect(extractSignedReceiptFromSettlement(null)).toBeNull();
    });

    it('returns null when extensions is absent', () => {
      expect(extractSignedReceiptFromSettlement({ success: true })).toBeNull();
    });

    it('returns null when the offer-receipt extension key is absent', () => {
      expect(
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: { 'some-other-extension': {} },
        })
      ).toBeNull();
    });

    it('returns null when info has no receipt field', () => {
      expect(
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: { 'offer-receipt': { info: { offers: [] } } },
        })
      ).toBeNull();
    });
  });

  describe('fail-closed malformed shapes', () => {
    it('throws settlement_extensions_invalid when extensions is non-object', () => {
      expect(() =>
        extractSignedReceiptFromSettlement({ success: true, extensions: 'not-an-object' })
      ).toThrow(X402Error);
      try {
        extractSignedReceiptFromSettlement({ success: true, extensions: 'not-an-object' });
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_invalid');
      }
    });

    it('throws settlement_extensions_invalid when the offer-receipt extension is non-object', () => {
      expect(() =>
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: { 'offer-receipt': 'not-an-object' },
        })
      ).toThrow(X402Error);
    });

    it('throws settlement_extensions_invalid when info is non-object', () => {
      expect(() =>
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: { 'offer-receipt': { info: 42 } },
        })
      ).toThrow(X402Error);
    });

    it('throws settlement_extensions_invalid when the receipt has an unrecognized format', () => {
      expect(() =>
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: {
            'offer-receipt': { info: { receipt: { format: 'unknown', signature: 'x' } } },
          },
        })
      ).toThrow(X402Error);
    });

    it('throws settlement_extensions_invalid when an EIP-712 receipt is missing its payload', () => {
      expect(() =>
        extractSignedReceiptFromSettlement({
          success: true,
          extensions: {
            'offer-receipt': { info: { receipt: { format: 'eip712', signature: SIG_EIP712 } } },
          },
        })
      ).toThrow(X402Error);
    });
  });

  describe('receipt-on-failed-settlement guard', () => {
    it('throws settlement_extensions_invalid when a receipt is embedded on success:false', () => {
      const settlement = {
        success: false,
        extensions: {
          'offer-receipt': { info: { receipt: { format: 'jws', signature: VALID_JWS } } },
        },
      };
      expect(() => extractSignedReceiptFromSettlement(settlement)).toThrow(X402Error);
      try {
        extractSignedReceiptFromSettlement(settlement);
        throw new Error('expected throw');
      } catch (err) {
        expect((err as X402Error).code).toBe('settlement_extensions_invalid');
      }
    });

    it('does not throw when success is absent entirely (e.g. a V1-shaped settlement)', () => {
      const settlement = {
        extensions: {
          'offer-receipt': { info: { receipt: { format: 'jws', signature: VALID_JWS } } },
        },
      };
      expect(() => extractSignedReceiptFromSettlement(settlement)).not.toThrow();
    });
  });

  describe('oversize JWS bound', () => {
    it('throws jws_too_large (not settlement_extensions_invalid) for an oversized JWS signature', () => {
      const oversized = 'x'.repeat(70_000);
      const settlement = {
        success: true,
        extensions: {
          'offer-receipt': { info: { receipt: { format: 'jws', signature: oversized } } },
        },
      };
      try {
        extractSignedReceiptFromSettlement(settlement);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(X402Error);
        expect((err as X402Error).code).toBe('jws_too_large');
      }
    });
  });
});
