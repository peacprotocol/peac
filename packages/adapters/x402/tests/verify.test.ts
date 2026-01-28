import { describe, it, expect } from 'vitest';
import {
  verifyOffer,
  verifyReceipt,
  matchAcceptTerms,
  selectAccept,
  X402Error,
} from '../src/index.js';
import type { SignedOffer, SignedReceipt, AcceptEntry, OfferPayload } from '../src/index.js';
import {
  ACCEPT_BASE,
  ACCEPT_ETH,
  ACCEPTS_SINGLE,
  ACCEPTS_MULTI,
  ACCEPTS_DUPLICATE,
  SIGNED_OFFER_VALID,
  SIGNED_OFFER_JWS,
  SIGNED_OFFER_EXPIRED,
  SIGNED_OFFER_BAD_VERSION,
  SIGNED_OFFER_WRONG_NETWORK,
  SIGNED_OFFER_WRONG_AMOUNT,
  SIGNED_RECEIPT_VALID,
  OFFER_PAYLOAD_VALID,
  SIG_EIP712,
} from './fixtures/index.js';

// ---------------------------------------------------------------------------
// verifyOffer
// ---------------------------------------------------------------------------

describe('verifyOffer', () => {
  describe('valid offers', () => {
    it('should verify a valid offer with acceptIndex hint', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(true);
      expect(result.matchedAccept).toEqual(ACCEPT_BASE);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should verify a valid offer without acceptIndex (scan)', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
      expect(result.matchedAccept).toEqual(ACCEPT_BASE);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(false);
    });

    it('should verify a valid JWS-format offer', () => {
      const result = verifyOffer(SIGNED_OFFER_JWS, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(true);
    });

    it('should find the correct match among multiple accepts', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI);
      expect(result.valid).toBe(true);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(false);
    });
  });

  describe('expired offers', () => {
    it('should reject an expired offer', () => {
      const result = verifyOffer(SIGNED_OFFER_EXPIRED, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('offer_expired');
    });

    it('should accept an offer within clock skew tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const offer: SignedOffer = {
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: now - 30 },
        signature: SIG_EIP712,
        format: 'eip712',
      };
      // Default clock skew is 60s, so 30s in the past should pass
      const result = verifyOffer(offer, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(true);
    });
  });

  describe('version checks', () => {
    it('should reject unsupported version', () => {
      const result = verifyOffer(SIGNED_OFFER_BAD_VERSION, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_version_unsupported');
    });

    it('should accept a custom supported version', () => {
      const offer: SignedOffer = {
        payload: { ...OFFER_PAYLOAD_VALID, version: '2' },
        signature: SIG_EIP712,
        format: 'eip712',
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE, 0, {
        supportedVersions: ['1', '2'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('acceptIndex edge cases', () => {
    it('should reject acceptIndex out of range (too high)', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE, 5);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_index_out_of_range');
    });

    it('should reject acceptIndex out of range (negative)', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE, -1);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_index_out_of_range');
    });

    it('should reject acceptIndex pointing to non-matching terms', () => {
      // acceptIndex 1 points to ETH entry, but offer is for USDC
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI, 1);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_term_mismatch');
    });

    it('should reject ambiguous matches when no acceptIndex provided', () => {
      // Two identical accept entries -- ambiguous
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_DUPLICATE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_ambiguous');
    });

    it('should reject when no accepts match and no index', () => {
      const result = verifyOffer(SIGNED_OFFER_WRONG_NETWORK, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_no_match');
    });

    it('should reject empty accepts list', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, []);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_no_match');
    });
  });

  describe('structural validation', () => {
    it('should reject offer missing payload', () => {
      const offer = { signature: SIG_EIP712, format: 'eip712' } as unknown as SignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_invalid_format');
    });

    it('should reject offer missing signature', () => {
      const offer = {
        payload: { ...OFFER_PAYLOAD_VALID },
        format: 'eip712',
      } as unknown as SignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
    });

    it('should reject offer with invalid format', () => {
      const offer = {
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
        format: 'unknown',
      } as unknown as SignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_invalid_format');
    });

    it('should reject offer payload missing required fields', () => {
      const offer: SignedOffer = {
        payload: { version: '1' } as unknown as OfferPayload,
        signature: SIG_EIP712,
        format: 'eip712',
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'payload_missing_field')).toBe(true);
    });

    it('should reject EIP-712 signature with invalid format', () => {
      const offer: SignedOffer = {
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: 'not-a-hex-signature',
        format: 'eip712',
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_signature_invalid');
    });
  });

  describe('DoS guards', () => {
    it('should reject too many accept entries', () => {
      // Generate 129 accept entries (exceeds MAX_ACCEPT_ENTRIES=128)
      const tooManyAccepts = Array.from({ length: 129 }, (_, i) => ({
        ...ACCEPT_BASE,
        payTo: `0x${i.toString(16).padStart(40, '0')}`,
      }));
      const result = verifyOffer(SIGNED_OFFER_VALID, tooManyAccepts, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
    });

    it('should accept exactly 128 entries (boundary)', () => {
      const maxAccepts = Array.from({ length: 128 }, (_, i) => ({
        ...ACCEPT_BASE,
        payTo: `0x${i.toString(16).padStart(40, '0')}`,
      }));
      // Set entry 0 to match the offer
      maxAccepts[0] = ACCEPT_BASE;
      const result = verifyOffer(SIGNED_OFFER_VALID, maxAccepts, 0);
      expect(result.valid).toBe(true);
    });

    it('should reject accept entry with oversized field (UTF-8 multibyte)', () => {
      // Use multibyte chars: each emoji is 4 bytes in UTF-8
      // 65 emojis = 260 bytes > MAX_FIELD_BYTES (256)
      const longNetwork = '🔥'.repeat(65);
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: longNetwork }];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
      expect(result.errors[0].field).toContain('network');
    });

    it('should accept field at byte limit (UTF-8 multibyte boundary)', () => {
      // 64 emojis = 256 bytes = exactly MAX_FIELD_BYTES
      const exactNetwork = '🔥'.repeat(64);
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: exactNetwork }];
      // This will fail network validation (not CAIP-2), not byte limit
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts, 0);
      // Should pass byte check, but fail on CAIP-2 format
      expect(result.errors[0]?.code).not.toBe('accept_too_many_entries');
    });

    it('should check per-field bytes before JSON.stringify', () => {
      // This test verifies ordering: per-field check should happen first
      // A giant field that would be caught by per-field check
      const giantField = 'x'.repeat(300); // > 256 bytes
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: giantField }];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
      expect(result.errors[0].field).toBe('accepts[0].network');
    });

    it('should reject oversized settlement objects (stringify bomb protection)', () => {
      // Settlement is JsonObject - could be arbitrarily large
      // Per-entry check bounds total size including settlement
      const largeSettlement = { data: 'x'.repeat(3000) }; // > MAX_ENTRY_BYTES (2048)
      const accepts = [{ ...ACCEPT_BASE, settlement: largeSettlement }] as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts, 0);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
      expect(result.errors[0].message).toContain('exceeds max entry size');
    });

    it('should accept entry with settlement within size limit', () => {
      // Small settlement should be fine
      const smallSettlement = { fee: '100', recipient: '0x123' };
      const accepts = [{ ...ACCEPT_BASE, settlement: smallSettlement }] as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts, 0);
      expect(result.valid).toBe(true);
    });
  });

  describe('replay/tamper resistance', () => {
    it('should not be affected by modified acceptIndex (unsigned field)', () => {
      // The same offer with different acceptIndex values
      // As long as term-matching passes, the result is the same
      const result0 = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI, 0);
      expect(result0.valid).toBe(true);
      expect(result0.matchedIndex).toBe(0);

      // acceptIndex 1 points to ETH, which doesn't match USDC offer
      const result1 = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI, 1);
      expect(result1.valid).toBe(false);
      expect(result1.errors[0].code).toBe('accept_term_mismatch');

      // Without index, scan finds the unique match
      const resultNone = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI);
      expect(resultNone.valid).toBe(true);
      expect(resultNone.matchedIndex).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// verifyReceipt
// ---------------------------------------------------------------------------

describe('verifyReceipt', () => {
  it('should verify a valid receipt', () => {
    const result = verifyReceipt(SIGNED_RECEIPT_VALID);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject receipt missing payload', () => {
    const receipt = { signature: SIG_EIP712, format: 'eip712' } as unknown as SignedReceipt;
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_invalid_format');
  });

  it('should reject receipt missing txHash', () => {
    const receipt: SignedReceipt = {
      payload: { version: '1', network: 'eip155:8453' } as never,
      signature: SIG_EIP712,
      format: 'eip712',
    };
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'payload.txHash')).toBe(true);
  });

  it('should reject unsupported receipt version', () => {
    const receipt: SignedReceipt = {
      payload: {
        version: '99',
        network: 'eip155:8453',
        txHash: '0xabc123',
      },
      signature: SIG_EIP712,
      format: 'eip712',
    };
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_version_unsupported');
  });

  describe('error precedence', () => {
    it('should check version before network validation (precedence regression)', () => {
      // Receipt with: unsupported version AND invalid network AND invalid amount
      // Version error should be first (not network or amount)
      const receipt: SignedReceipt = {
        payload: {
          version: '99', // unsupported
          network: 'not-caip2', // invalid CAIP-2
          txHash: '0xabc123',
          amount: '12.34', // decimal (invalid)
        },
        signature: SIG_EIP712,
        format: 'eip712',
      };
      const result = verifyReceipt(receipt);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      // The FIRST error should be version, not network or amount
      expect(result.errors[0].code).toBe('receipt_version_unsupported');
    });

    it('should check signature format before amount/network validation', () => {
      // Receipt with: valid version, invalid signature format, AND invalid network
      // Signature error should be first
      const receipt: SignedReceipt = {
        payload: {
          version: '1',
          network: 'not-caip2', // invalid CAIP-2
          txHash: '0xabc123',
          amount: '12.34', // decimal (invalid)
        },
        signature: 'not-a-valid-signature',
        format: 'eip712',
      };
      const result = verifyReceipt(receipt);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      // Signature format error should come before network/amount
      expect(result.errors[0].code).toBe('receipt_signature_invalid');
    });

    it('should check amount before network validation', () => {
      // Receipt with: valid version/signature, invalid amount AND invalid network
      const receipt: SignedReceipt = {
        payload: {
          version: '1',
          network: 'not-caip2', // invalid CAIP-2
          txHash: '0xabc123',
          amount: '12.34', // decimal (invalid)
        },
        signature: SIG_EIP712,
        format: 'eip712',
      };
      const result = verifyReceipt(receipt);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      // Amount error should come before network
      expect(result.errors[0].code).toBe('amount_invalid');
    });
  });
});

// ---------------------------------------------------------------------------
// matchAcceptTerms
// ---------------------------------------------------------------------------

describe('matchAcceptTerms', () => {
  it('should return empty array for matching terms', () => {
    const mismatches = matchAcceptTerms(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPT_BASE);
    expect(mismatches).toEqual([]);
  });

  it('should identify network mismatch', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, network: 'eip155:1' } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('network');
  });

  it('should identify asset mismatch', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, asset: 'ETH' } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('asset');
  });

  it('should identify amount mismatch', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, amount: '999' } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('amount');
  });

  it('should identify payTo mismatch', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, payTo: '0xdead' } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('payTo');
  });

  it('should identify multiple mismatches', () => {
    const payload = {
      ...OFFER_PAYLOAD_VALID,
      network: 'eip155:1',
      asset: 'ETH',
    } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('network');
    expect(mismatches).toContain('asset');
    expect(mismatches).toHaveLength(2);
  });

  it('should compare scheme when both present', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, scheme: 'exact' } as OfferPayload;
    const accept = { ...ACCEPT_BASE, scheme: 'flexible' };
    const mismatches = matchAcceptTerms(payload, accept);
    expect(mismatches).toContain('scheme');
  });

  it('should not compare scheme when only one side has it', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, scheme: 'exact' } as OfferPayload;
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).not.toContain('scheme');
  });
});

// ---------------------------------------------------------------------------
// selectAccept
// ---------------------------------------------------------------------------

describe('selectAccept', () => {
  it('should select by hint when acceptIndex matches', () => {
    const result = selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_SINGLE, 0);
    expect(result.entry).toEqual(ACCEPT_BASE);
    expect(result.index).toBe(0);
    expect(result.usedHint).toBe(true);
  });

  it('should select by scan when no acceptIndex', () => {
    const result = selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_SINGLE);
    expect(result.entry).toEqual(ACCEPT_BASE);
    expect(result.index).toBe(0);
    expect(result.usedHint).toBe(false);
  });

  it('should throw on acceptIndex out of range', () => {
    expect(() => selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_SINGLE, 5)).toThrow(
      X402Error
    );

    try {
      selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_SINGLE, 5);
    } catch (e) {
      expect(e).toBeInstanceOf(X402Error);
      expect((e as X402Error).code).toBe('accept_index_out_of_range');
    }
  });

  it('should throw on acceptIndex term mismatch', () => {
    expect(() => selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_MULTI, 1)).toThrow(
      X402Error
    );

    try {
      selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_MULTI, 1);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_term_mismatch');
    }
  });

  it('should throw on no matches', () => {
    const payload = { ...OFFER_PAYLOAD_VALID, network: 'eip155:1' } as OfferPayload;
    expect(() => selectAccept(payload, ACCEPTS_SINGLE)).toThrow(X402Error);

    try {
      selectAccept(payload, ACCEPTS_SINGLE);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_no_match');
    }
  });

  it('should throw on ambiguous matches', () => {
    expect(() => selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_DUPLICATE)).toThrow(
      X402Error
    );

    try {
      selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, ACCEPTS_DUPLICATE);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_ambiguous');
    }
  });

  it('should throw on empty accepts', () => {
    expect(() => selectAccept(OFFER_PAYLOAD_VALID as OfferPayload, [])).toThrow(X402Error);
  });
});

// ---------------------------------------------------------------------------
// X402Error
// ---------------------------------------------------------------------------

describe('X402Error', () => {
  it('should have correct properties', () => {
    const err = new X402Error('offer_expired', 'Offer has expired', {
      field: 'payload.validUntil',
    });
    expect(err.name).toBe('X402Error');
    expect(err.code).toBe('offer_expired');
    expect(err.message).toBe('Offer has expired');
    expect(err.httpStatus).toBe(400);
    expect(err.field).toBe('payload.validUntil');
  });

  it('should use correct HTTP status for auth errors', () => {
    const err = new X402Error('offer_signature_invalid', 'Bad signature');
    expect(err.httpStatus).toBe(401);
  });

  it('should serialize to JSON', () => {
    const err = new X402Error('accept_no_match', 'No match', {
      details: { tried: 3 },
    });
    const json = err.toJSON();
    expect(json.code).toBe('accept_no_match');
    expect(json.message).toBe('No match');
    expect(json.httpStatus).toBe(400);
    expect(json.details).toEqual({ tried: 3 });
  });

  it('should be an instance of Error', () => {
    const err = new X402Error('offer_expired', 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(X402Error);
  });
});
