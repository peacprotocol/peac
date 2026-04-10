/**
 * Overclaim-guard test for x402 scheme scope.
 *
 * PEAC is scheme-agnostic at the verification layer. This suite documents
 * the intentional boundary between what PEAC enforces (wire shape, required
 * fields, term-matching, offer-receipt consistency) and what it does NOT
 * enforce (scheme-specific invariants such as `upto` single-use, time bounds,
 * recipient binding, facilitator binding, or max-vs-actual settlement).
 *
 * These tests are regression guards. If a future change accidentally drops
 * `scheme` from term-matching, normalizes it, or starts interpreting
 * scheme-specific fields, this suite fails loudly so the boundary is
 * restated explicitly in the reviewing PR.
 *
 * See docs/specs/X402-PROFILE.md § 3.0 and
 * docs/compatibility/x402-scheme-coverage.md for the normative statement.
 */

import { describe, it, expect } from 'vitest';
import { matchAcceptTerms, toPeacRecord } from '../src/index.js';
import type {
  NormalizedOfferPayload,
  AcceptEntry,
  X402OfferReceiptChallenge,
  X402SettlementResponse,
  RawEIP712SignedOffer,
  RawEIP712SignedReceipt,
} from '../src/index.js';
import { OFFER_PAYLOAD_VALID, RECEIPT_PAYLOAD_VALID, SIG_EIP712 } from './fixtures/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uptoOfferPayload(overrides: Partial<NormalizedOfferPayload> = {}): NormalizedOfferPayload {
  return {
    version: 1,
    validUntil: OFFER_PAYLOAD_VALID.validUntil,
    network: 'eip155:8453',
    asset: 'USDC',
    amount: '100000',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    resourceUrl: 'https://api.example.com/metered/inference',
    scheme: 'upto',
    ...overrides,
  };
}

function uptoAccept(overrides: Partial<AcceptEntry> = {}): AcceptEntry {
  return {
    network: 'eip155:8453',
    asset: 'USDC',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '100000',
    scheme: 'upto',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Term-matching regression guards
// ---------------------------------------------------------------------------

describe('x402 scheme scope: term-matching guards', () => {
  it('term-matching accepts scheme: upto when both sides agree', () => {
    const mismatches = matchAcceptTerms(uptoOfferPayload(), uptoAccept());
    expect(mismatches).toEqual([]);
  });

  it('term-matching rejects offer scheme: upto vs accept scheme: exact', () => {
    const mismatches = matchAcceptTerms(uptoOfferPayload(), uptoAccept({ scheme: 'exact' }));
    expect(mismatches).toContain('scheme');
  });

  it('term-matching rejects offer scheme: exact vs accept scheme: upto', () => {
    const mismatches = matchAcceptTerms(uptoOfferPayload({ scheme: 'exact' }), uptoAccept());
    expect(mismatches).toContain('scheme');
  });

  it('scheme is treated as an opaque required string (unknown future schemes pass term-matching when both sides agree)', () => {
    // The adapter must not hardcode a closed enum of schemes. If upstream adds
    // a new scheme, the adapter should continue to term-match it as a string
    // without any code change.
    const mismatches = matchAcceptTerms(
      uptoOfferPayload({ scheme: 'future-scheme-v1' }),
      uptoAccept({ scheme: 'future-scheme-v1' })
    );
    expect(mismatches).toEqual([]);
  });

  it('scheme comparison is byte-equal (no case folding, no normalization)', () => {
    // Case folding or whitespace trimming on scheme would silently bridge
    // distinct scheme identifiers, breaking the security contract.
    const mismatches = matchAcceptTerms(
      uptoOfferPayload({ scheme: 'upto' }),
      uptoAccept({ scheme: 'UPTO' })
    );
    expect(mismatches).toContain('scheme');
  });
});

// ---------------------------------------------------------------------------
// Pass-through preservation in toPeacRecord (v1 path)
// ---------------------------------------------------------------------------

describe('x402 scheme scope: pass-through preservation in toPeacRecord', () => {
  const signedUptoOffer: RawEIP712SignedOffer = {
    format: 'eip712',
    payload: {
      ...OFFER_PAYLOAD_VALID,
      scheme: 'upto',
      resourceUrl: 'https://api.example.com/metered/inference',
    },
    signature: SIG_EIP712,
    acceptIndex: 0,
  };

  const signedReceipt: RawEIP712SignedReceipt = {
    format: 'eip712',
    payload: {
      ...RECEIPT_PAYLOAD_VALID,
      resourceUrl: 'https://api.example.com/metered/inference',
    },
    signature: SIG_EIP712,
  };

  const challenge: X402OfferReceiptChallenge = {
    accepts: [
      {
        network: 'eip155:8453',
        asset: 'USDC',
        payTo: '0x1234567890abcdef1234567890abcdef12345678',
        amount: OFFER_PAYLOAD_VALID.amount,
        scheme: 'upto',
      },
    ],
    offers: [signedUptoOffer],
    resourceUrl: 'https://api.example.com/metered/inference',
  };

  const settlement: X402SettlementResponse = {
    receipt: signedReceipt,
    resourceUrl: 'https://api.example.com/metered/inference',
  };

  it('preserves scheme: upto verbatim in the raw offer artifact', () => {
    const record = toPeacRecord(challenge, settlement);
    // The raw signed offer is preserved at proofs.x402.offer and MUST NOT
    // be mutated by the adapter. Downstream auditors read scheme from here.
    expect(record.proofs.x402.offer).toEqual(signedUptoOffer);
    expect((record.proofs.x402.offer as RawEIP712SignedOffer).payload.scheme).toBe('upto');
  });

  it('does not normalize or strip scheme from the raw offer payload', () => {
    const record = toPeacRecord(challenge, settlement);
    const rawOffer = record.proofs.x402.offer as RawEIP712SignedOffer;
    // Explicit: any future normalization that lowercases, trims, or
    // substitutes scheme values is an overclaim surface. This assertion
    // must fail loudly if such a normalization is introduced.
    expect(rawOffer.payload.scheme).toBe('upto');
    expect(rawOffer.payload.scheme).not.toBe('UPTO');
    expect(rawOffer.payload.scheme).not.toBe('exact');
  });

  it('does not invent scheme-specific evidence fields on v1 records', () => {
    // Documents the intentional boundary: the v1 evidence map flattens a
    // subset of the offer payload for convenience. scheme-specific fields
    // (single-use nonce, validAfter, maxAuthorized, etc.) are NOT present
    // because PEAC does not interpret them. Auditors must read
    // scheme-specific data from the raw artifact at proofs.x402.offer.
    const record = toPeacRecord(challenge, settlement);
    // Only the documented evidence keys exist; no smuggled scheme fields.
    const evidenceKeys = Object.keys(record.evidence);
    expect(evidenceKeys).not.toContain('singleUse');
    expect(evidenceKeys).not.toContain('validAfter');
    expect(evidenceKeys).not.toContain('maxAuthorized');
    expect(evidenceKeys).not.toContain('actualCharged');
    expect(evidenceKeys).not.toContain('facilitator');
  });
});
