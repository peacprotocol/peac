import { describe, it, expect } from 'vitest';
import {
  verifyOffer,
  verifyReceipt,
  verifyOfferReceiptConsistency,
  matchAcceptTerms,
  selectAccept,
  X402Error,
  normalizeOfferPayload,
  normalizeReceiptPayload,
} from '../src/index.js';
import type {
  RawSignedOffer,
  RawEIP712SignedOffer,
  RawEIP712SignedReceipt,
  RawSignedReceipt,
  AcceptEntry,
  NormalizedOfferPayload,
  RawOfferPayload,
  RawReceiptPayload,
} from '../src/index.js';
import {
  ACCEPT_BASE,
  ACCEPTS_SINGLE,
  ACCEPTS_MULTI,
  ACCEPTS_DUPLICATE,
  SIGNED_OFFER_VALID,
  SIGNED_OFFER_NO_INDEX,
  SIGNED_OFFER_EXPIRED,
  SIGNED_OFFER_BAD_VERSION,
  SIGNED_OFFER_WRONG_NETWORK,
  SIGNED_RECEIPT_VALID,
  OFFER_PAYLOAD_VALID,
  RECEIPT_PAYLOAD_VALID,
  SIG_EIP712,
} from './fixtures/index.js';

// ---------------------------------------------------------------------------
// verifyOffer
// ---------------------------------------------------------------------------

describe('verifyOffer', () => {
  describe('valid offers', () => {
    it('should verify a valid offer with acceptIndex hint', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
      expect(result.matchedAccept).toEqual(ACCEPT_BASE);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should verify a valid offer without acceptIndex (scan)', () => {
      const result = verifyOffer(SIGNED_OFFER_NO_INDEX, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
      expect(result.matchedAccept).toEqual(ACCEPT_BASE);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(false);
    });

    it('should find the correct match among multiple accepts', () => {
      const result = verifyOffer(SIGNED_OFFER_NO_INDEX, ACCEPTS_MULTI);
      expect(result.valid).toBe(true);
      expect(result.matchedIndex).toBe(0);
      expect(result.usedHint).toBe(false);
    });
  });

  describe('expired offers', () => {
    it('should reject an expired offer', () => {
      const result = verifyOffer(SIGNED_OFFER_EXPIRED, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('offer_expired');
    });

    it('should accept an offer within clock skew tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: now - 30 },
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      // Default clock skew is 60s, so 30s in the past should pass
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
    });
  });

  describe('expiry policy', () => {
    it('should accept offer without expiry by default (allow_missing is upstream-compatible default)', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: 0 }, // EIP-712 placeholder
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      // Default is allow_missing (upstream-compatible)
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
    });

    it('should reject offer without expiry when offerExpiryPolicy is require', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: 0 },
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE, { offerExpiryPolicy: 'require' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_no_expiry');
    });

    it('should accept offer without expiry when offerExpiryPolicy is allow_missing', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, validUntil: 0 },
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE, { offerExpiryPolicy: 'allow_missing' });
      expect(result.valid).toBe(true);
    });
  });

  describe('version checks', () => {
    it('should reject unsupported version', () => {
      const result = verifyOffer(SIGNED_OFFER_BAD_VERSION, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_version_unsupported');
    });

    it('should accept a custom supported version', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID, version: 2 },
        signature: SIG_EIP712,
        acceptIndex: 0,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE, {
        supportedVersions: [1, 2],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('acceptIndex edge cases', () => {
    it('should reject acceptIndex out of range (too high)', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
        acceptIndex: 5,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_index_out_of_range');
    });

    it('should reject acceptIndex out of range (negative)', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
        acceptIndex: -1,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      // Negative acceptIndex fails wire validation (non-negative integer check)
      expect(result.errors[0].code).toBe('offer_invalid_format');
    });

    it('should reject acceptIndex pointing to non-matching terms', () => {
      // acceptIndex 1 points to ETH entry, but offer is for USDC
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
        acceptIndex: 1,
      };
      const result = verifyOffer(offer, ACCEPTS_MULTI);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_term_mismatch');
    });

    it('should reject ambiguous matches when no acceptIndex provided', () => {
      // Two identical accept entries -- ambiguous
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
      };
      const result = verifyOffer(offer, ACCEPTS_DUPLICATE);
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
    it('should reject offer missing payload (EIP-712)', () => {
      const offer = { format: 'eip712', signature: SIG_EIP712 } as unknown as RawSignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_invalid_format');
    });

    it('should reject offer missing signature', () => {
      const offer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
      } as unknown as RawSignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
    });

    it('should reject offer with invalid format', () => {
      const offer = {
        format: 'unknown',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
      } as unknown as RawSignedOffer;
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_invalid_format');
    });

    it('should reject offer payload missing required fields', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { version: 1 } as unknown as RawOfferPayload,
        signature: SIG_EIP712,
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'payload_missing_field')).toBe(true);
    });

    it('should reject EIP-712 signature with invalid format', () => {
      const offer: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: 'not-a-hex-signature',
      };
      const result = verifyOffer(offer, ACCEPTS_SINGLE);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('offer_signature_invalid');
    });
  });

  describe('DoS guards', () => {
    it('should reject too many accept entries', () => {
      const tooManyAccepts = Array.from({ length: 129 }, (_, i) => ({
        ...ACCEPT_BASE,
        payTo: `0x${i.toString(16).padStart(40, '0')}`,
      }));
      const result = verifyOffer(SIGNED_OFFER_VALID, tooManyAccepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
    });

    it('should accept exactly 128 entries (boundary)', () => {
      const maxAccepts = Array.from({ length: 128 }, (_, i) => ({
        ...ACCEPT_BASE,
        payTo: `0x${i.toString(16).padStart(40, '0')}`,
      }));
      maxAccepts[0] = ACCEPT_BASE;
      const result = verifyOffer(SIGNED_OFFER_VALID, maxAccepts);
      expect(result.valid).toBe(true);
    });

    it('should reject accept entry with oversized field (UTF-8 multibyte)', () => {
      const longNetwork = '\u{1F525}'.repeat(65); // 260 bytes > 256
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: longNetwork }];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
      expect(result.errors[0].field).toContain('network');
    });

    it('should accept field at byte limit (UTF-8 multibyte boundary)', () => {
      const exactNetwork = '\u{1F525}'.repeat(64); // 256 bytes = exactly MAX_FIELD_BYTES
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: exactNetwork }];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      // Should pass byte check, but fail on CAIP-2 format
      expect(result.errors[0]?.code).not.toBe('accept_too_many_entries');
    });

    it('should check per-field bytes before JSON.stringify', () => {
      const giantField = 'x'.repeat(300); // > 256 bytes
      const accepts: AcceptEntry[] = [{ ...ACCEPT_BASE, network: giantField }];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_too_many_entries');
      expect(result.errors[0].field).toBe('accepts[0].network');
    });

    it('should reject oversized entries (allocation-safe protection)', () => {
      // Force a very large entry by extending with extra properties
      const largeEntry = { ...ACCEPT_BASE, extraData: 'x'.repeat(3000) } as unknown as AcceptEntry;
      const accepts = [largeEntry];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('exceeds max entry size');
    });

    it('should accept entry within size limit', () => {
      const result = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_SINGLE);
      expect(result.valid).toBe(true);
    });

    it('bounded byte counter should be conservative (never undercount)', () => {
      const testCases = [
        { ...ACCEPT_BASE },
        { ...ACCEPT_BASE, network: 'eip155:8453', asset: 'USDC' },
      ];

      for (const entry of testCases) {
        const actualBytes = new TextEncoder().encode(JSON.stringify(entry)).length;
        if (actualBytes <= 2048) {
          const accepts = [entry] as AcceptEntry[];
          const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
          const sizeError = result.errors.find(
            (e) =>
              e.code === 'accept_entry_invalid' && e.message?.includes('exceeds max entry size')
          );
          expect(sizeError).toBeUndefined();
        }
      }
    });
  });

  describe('shape validation (runtime type guards)', () => {
    it('should reject accept entry with network as number', () => {
      const accepts = [{ ...ACCEPT_BASE, network: 1 }] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('must be a string');
      expect(result.errors[0].field).toBe('accepts[0].network');
    });

    it('should reject accept entry with scheme as boolean', () => {
      const accepts = [{ ...ACCEPT_BASE, scheme: false }] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('must be a string');
      expect(result.errors[0].field).toBe('accepts[0].scheme');
    });

    it('should reject accept entry with amount as number', () => {
      const accepts = [{ ...ACCEPT_BASE, amount: 1000000 }] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
    });

    it('should reject non-object accept entry', () => {
      const accepts = ['not an object'] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('must be a plain object');
    });

    it('should reject accept entry with missing required field', () => {
      const { network: _, ...incomplete } = ACCEPT_BASE;
      const accepts = [incomplete] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('network is required');
    });

    it('should reject accept entry with missing scheme', () => {
      const { scheme: _, ...noScheme } = ACCEPT_BASE;
      const accepts = [noScheme] as unknown as AcceptEntry[];
      const result = verifyOffer(SIGNED_OFFER_VALID, accepts);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('accept_entry_invalid');
      expect(result.errors[0].message).toContain('scheme is required');
    });
  });

  describe('replay/tamper resistance', () => {
    it('should not be affected by modified acceptIndex (unsigned field)', () => {
      const result0 = verifyOffer(SIGNED_OFFER_VALID, ACCEPTS_MULTI);
      expect(result0.valid).toBe(true);
      expect(result0.matchedIndex).toBe(0);

      // acceptIndex 1 points to ETH, which doesn't match USDC offer
      const offer1: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
        acceptIndex: 1,
      };
      const result1 = verifyOffer(offer1, ACCEPTS_MULTI);
      expect(result1.valid).toBe(false);
      expect(result1.errors[0].code).toBe('accept_term_mismatch');

      // Without index, scan finds the unique match
      const offerNone: RawEIP712SignedOffer = {
        format: 'eip712',
        payload: { ...OFFER_PAYLOAD_VALID },
        signature: SIG_EIP712,
      };
      const resultNone = verifyOffer(offerNone, ACCEPTS_MULTI);
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

  it('should reject receipt missing payload (EIP-712)', () => {
    const receipt = { format: 'eip712', signature: SIG_EIP712 } as unknown as RawSignedReceipt;
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_invalid_format');
  });

  it('should reject receipt missing required fields', () => {
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: { version: 1, network: 'eip155:8453' } as unknown as RawReceiptPayload,
      signature: SIG_EIP712,
    };
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'payload_missing_field')).toBe(true);
  });

  it('should reject unsupported receipt version', () => {
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: {
        ...RECEIPT_PAYLOAD_VALID,
        version: 99,
      },
      signature: SIG_EIP712,
    };
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_version_unsupported');
  });

  it('should accept receipt within default recency window (3600s upstream-compatible)', () => {
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: {
        ...RECEIPT_PAYLOAD_VALID,
        issuedAt: Math.floor(Date.now() / 1000) - 600, // 10 min ago, within 3600s default
      },
      signature: SIG_EIP712,
    };
    // Default recency is 3600s (upstream-compatible), so 10 min ago should pass
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(true);
  });

  it('should reject stale receipt (issuedAt too old for configured window)', () => {
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: {
        ...RECEIPT_PAYLOAD_VALID,
        issuedAt: Math.floor(Date.now() / 1000) - 600, // 10 min ago
      },
      signature: SIG_EIP712,
    };
    const result = verifyReceipt(receipt, { receiptRecencySeconds: 300 });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_issuedAt_stale');
  });

  it('should reject invalid payer', () => {
    const receipt: RawEIP712SignedReceipt = {
      format: 'eip712',
      payload: {
        ...RECEIPT_PAYLOAD_VALID,
        payer: '',
      },
      signature: SIG_EIP712,
    };
    const result = verifyReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_payer_invalid');
  });

  describe('EIP-712 placeholder normalization', () => {
    it('should normalize empty transaction to absent', () => {
      const receipt: RawEIP712SignedReceipt = {
        format: 'eip712',
        payload: {
          ...RECEIPT_PAYLOAD_VALID,
          transaction: '', // EIP-712 placeholder
        },
        signature: SIG_EIP712,
      };
      // Empty transaction is normalized to undefined, should pass
      const result = verifyReceipt(receipt);
      expect(result.valid).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// matchAcceptTerms
// ---------------------------------------------------------------------------

describe('matchAcceptTerms', () => {
  const normalizedPayload: NormalizedOfferPayload = {
    version: 1,
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    network: 'eip155:8453',
    asset: 'USDC',
    amount: '1000000',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    resourceUrl: 'https://api.example.com/weather/london',
    scheme: 'exact',
  };

  it('should return empty array for matching terms', () => {
    const mismatches = matchAcceptTerms(normalizedPayload, ACCEPT_BASE);
    expect(mismatches).toEqual([]);
  });

  it('should identify network mismatch', () => {
    const payload = { ...normalizedPayload, network: 'eip155:1' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('network');
  });

  it('should identify asset mismatch', () => {
    const payload = { ...normalizedPayload, asset: 'ETH' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('asset');
  });

  it('should identify amount mismatch', () => {
    const payload = { ...normalizedPayload, amount: '999' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('amount');
  });

  it('should identify payTo mismatch', () => {
    const payload = { ...normalizedPayload, payTo: '0xdead' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('payTo');
  });

  it('should identify multiple mismatches', () => {
    const payload = { ...normalizedPayload, network: 'eip155:1', asset: 'ETH' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('network');
    expect(mismatches).toContain('asset');
    expect(mismatches).toHaveLength(2);
  });

  it('should always compare scheme (required in v0.12.1)', () => {
    const payload = { ...normalizedPayload, scheme: 'flexible' };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).toContain('scheme');
  });

  it('should use network-aware address comparison for EVM', () => {
    // EVM addresses are case-insensitive
    const payload = {
      ...normalizedPayload,
      payTo: '0x1234567890ABCDEF1234567890ABCDEF12345678', // uppercase
    };
    const mismatches = matchAcceptTerms(payload, ACCEPT_BASE);
    expect(mismatches).not.toContain('payTo');
  });

  it('should use exact address comparison for non-EVM', () => {
    const solanaPayload: NormalizedOfferPayload = {
      ...normalizedPayload,
      network: 'solana:mainnet',
      payTo: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
      scheme: 'exact',
    };
    const solanaAccept: AcceptEntry = {
      ...ACCEPT_BASE,
      network: 'solana:mainnet',
      payTo: '7ecdhsygxxyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', // different case
      scheme: 'exact',
    };
    const mismatches = matchAcceptTerms(solanaPayload, solanaAccept);
    expect(mismatches).toContain('payTo'); // Solana is case-sensitive
  });
});

// ---------------------------------------------------------------------------
// selectAccept
// ---------------------------------------------------------------------------

describe('selectAccept', () => {
  const normalizedPayload: NormalizedOfferPayload = {
    version: 1,
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    network: 'eip155:8453',
    asset: 'USDC',
    amount: '1000000',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    resourceUrl: 'https://api.example.com/weather/london',
    scheme: 'exact',
  };

  it('should select by hint when acceptIndex matches', () => {
    const result = selectAccept(normalizedPayload, ACCEPTS_SINGLE, 0);
    expect(result.entry).toEqual(ACCEPT_BASE);
    expect(result.index).toBe(0);
    expect(result.usedHint).toBe(true);
  });

  it('should select by scan when no acceptIndex', () => {
    const result = selectAccept(normalizedPayload, ACCEPTS_SINGLE);
    expect(result.entry).toEqual(ACCEPT_BASE);
    expect(result.index).toBe(0);
    expect(result.usedHint).toBe(false);
  });

  it('should throw on acceptIndex out of range', () => {
    expect(() => selectAccept(normalizedPayload, ACCEPTS_SINGLE, 5)).toThrow(X402Error);

    try {
      selectAccept(normalizedPayload, ACCEPTS_SINGLE, 5);
    } catch (e) {
      expect(e).toBeInstanceOf(X402Error);
      expect((e as X402Error).code).toBe('accept_index_out_of_range');
    }
  });

  it('should throw on acceptIndex term mismatch', () => {
    expect(() => selectAccept(normalizedPayload, ACCEPTS_MULTI, 1)).toThrow(X402Error);

    try {
      selectAccept(normalizedPayload, ACCEPTS_MULTI, 1);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_term_mismatch');
    }
  });

  it('should throw on no matches', () => {
    const payload = { ...normalizedPayload, network: 'eip155:1' };
    expect(() => selectAccept(payload, ACCEPTS_SINGLE)).toThrow(X402Error);

    try {
      selectAccept(payload, ACCEPTS_SINGLE);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_no_match');
    }
  });

  it('should throw on ambiguous matches', () => {
    expect(() => selectAccept(normalizedPayload, ACCEPTS_DUPLICATE)).toThrow(X402Error);

    try {
      selectAccept(normalizedPayload, ACCEPTS_DUPLICATE);
    } catch (e) {
      expect((e as X402Error).code).toBe('accept_ambiguous');
    }
  });

  it('should throw on empty accepts', () => {
    expect(() => selectAccept(normalizedPayload, [])).toThrow(X402Error);
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

  it('should have correct HTTP status for new error codes', () => {
    expect(new X402Error('offer_no_expiry', 'no expiry').httpStatus).toBe(400);
    expect(new X402Error('receipt_resource_mismatch', 'mismatch').httpStatus).toBe(400);
    expect(new X402Error('receipt_network_mismatch', 'mismatch').httpStatus).toBe(400);
    expect(new X402Error('receipt_issuedAt_stale', 'stale').httpStatus).toBe(400);
    expect(new X402Error('receipt_payer_invalid', 'invalid').httpStatus).toBe(400);
    expect(new X402Error('receipt_payer_not_in_candidates', 'not in candidates').httpStatus).toBe(
      400
    );
    expect(new X402Error('jws_too_large', 'too large').httpStatus).toBe(400);
    expect(new X402Error('jws_malformed', 'malformed').httpStatus).toBe(400);
    expect(new X402Error('jws_padded_base64url', 'padded').httpStatus).toBe(400);
    expect(new X402Error('jws_payload_not_object', 'not object').httpStatus).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// verifyOfferReceiptConsistency
// ---------------------------------------------------------------------------

describe('verifyOfferReceiptConsistency', () => {
  const offerPayload = normalizeOfferPayload(OFFER_PAYLOAD_VALID);
  const receiptPayload = normalizeReceiptPayload(RECEIPT_PAYLOAD_VALID);

  it('should pass when resourceUrl and network match', () => {
    const result = verifyOfferReceiptConsistency(offerPayload, receiptPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail on resourceUrl mismatch', () => {
    const badReceipt = { ...receiptPayload, resourceUrl: 'https://other.example.com/resource' };
    const result = verifyOfferReceiptConsistency(offerPayload, badReceipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_resource_mismatch');
  });

  it('should fail on network mismatch', () => {
    const badReceipt = { ...receiptPayload, network: 'eip155:1' };
    const result = verifyOfferReceiptConsistency(offerPayload, badReceipt);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('receipt_network_mismatch');
  });

  describe('payer-aware consistency', () => {
    it('should pass when payer matches a candidate (EVM case-insensitive)', () => {
      const result = verifyOfferReceiptConsistency(offerPayload, receiptPayload, undefined, {
        payerCandidates: [receiptPayload.payer!.toUpperCase()],
      });
      expect(result.valid).toBe(true);
    });

    it('should fail when payer does not match any candidate', () => {
      const result = verifyOfferReceiptConsistency(offerPayload, receiptPayload, undefined, {
        payerCandidates: ['0x0000000000000000000000000000000000000000'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('receipt_payer_not_in_candidates');
    });

    it('should pass when no payerCandidates provided (optional check)', () => {
      const result = verifyOfferReceiptConsistency(offerPayload, receiptPayload, undefined, {
        payerCandidates: [],
      });
      // Empty array means no check (same as not providing)
      expect(result.valid).toBe(true);
    });

    it('should use custom address comparator for payer matching', () => {
      // Custom comparator that always returns false
      const neverMatch = () => false;
      const result = verifyOfferReceiptConsistency(offerPayload, receiptPayload, undefined, {
        payerCandidates: [receiptPayload.payer!],
        addressComparator: neverMatch,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('receipt_payer_not_in_candidates');
    });
  });
});
