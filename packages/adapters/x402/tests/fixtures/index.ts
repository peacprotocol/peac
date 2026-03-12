/**
 * Test fixtures for x402 adapter tests
 */

import type {
  RawEIP712SignedOffer,
  RawEIP712SignedReceipt,
  RawSignedOffer,
  RawSignedReceipt,
  RawOfferPayload,
  RawReceiptPayload,
  AcceptEntry,
  X402OfferReceiptChallenge,
  X402SettlementResponse,
} from '../../src/types.js';

// ---------------------------------------------------------------------------
// Valid Accept Entries
// ---------------------------------------------------------------------------

export const ACCEPT_BASE: AcceptEntry = {
  network: 'eip155:8453',
  asset: 'USDC',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '1000000',
  scheme: 'exact',
};

export const ACCEPT_ETH: AcceptEntry = {
  network: 'eip155:8453',
  asset: 'ETH',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '500000000000000000',
  scheme: 'exact',
};

export const ACCEPT_SOLANA: AcceptEntry = {
  network: 'solana:mainnet',
  asset: 'USDC',
  payTo: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
  amount: '1000000',
  scheme: 'exact',
};

export const ACCEPTS_SINGLE = [ACCEPT_BASE];
export const ACCEPTS_MULTI = [ACCEPT_BASE, ACCEPT_ETH, ACCEPT_SOLANA];
export const ACCEPTS_DUPLICATE = [ACCEPT_BASE, { ...ACCEPT_BASE }];

// ---------------------------------------------------------------------------
// Valid Offer Payloads (Raw, Layer A2)
// ---------------------------------------------------------------------------

/** Matching the BASE accept entry */
export const OFFER_PAYLOAD_VALID: RawOfferPayload = {
  version: 1,
  validUntil: Math.floor(Date.now() / 1000) + 3600,
  network: 'eip155:8453',
  asset: 'USDC',
  amount: '1000000',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  resourceUrl: 'https://api.example.com/weather/london',
  scheme: 'exact',
};

/** Expired offer (validUntil in the past) */
export const OFFER_PAYLOAD_EXPIRED: RawOfferPayload = {
  ...OFFER_PAYLOAD_VALID,
  validUntil: Math.floor(Date.now() / 1000) - 3600,
};

/** Unsupported version */
export const OFFER_PAYLOAD_BAD_VERSION: RawOfferPayload = {
  ...OFFER_PAYLOAD_VALID,
  version: 99,
};

/** Mismatched network (doesn't match any accept entry) */
export const OFFER_PAYLOAD_WRONG_NETWORK: RawOfferPayload = {
  ...OFFER_PAYLOAD_VALID,
  network: 'eip155:1',
};

/** Mismatched amount */
export const OFFER_PAYLOAD_WRONG_AMOUNT: RawOfferPayload = {
  ...OFFER_PAYLOAD_VALID,
  amount: '9999999',
};

// ---------------------------------------------------------------------------
// Valid Signatures (structural only; NOT cryptographically valid)
// ---------------------------------------------------------------------------

/** Dummy EIP-712 signature (65 bytes hex) */
export const SIG_EIP712 = '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b';

// ---------------------------------------------------------------------------
// Signed Offers (EIP-712 format; discriminated union)
// ---------------------------------------------------------------------------

export const SIGNED_OFFER_VALID: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_VALID },
  signature: SIG_EIP712,
  acceptIndex: 0,
};

export const SIGNED_OFFER_NO_INDEX: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_VALID },
  signature: SIG_EIP712,
};

export const SIGNED_OFFER_EXPIRED: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_EXPIRED },
  signature: SIG_EIP712,
};

export const SIGNED_OFFER_BAD_VERSION: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_BAD_VERSION },
  signature: SIG_EIP712,
};

export const SIGNED_OFFER_WRONG_NETWORK: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_WRONG_NETWORK },
  signature: SIG_EIP712,
};

export const SIGNED_OFFER_WRONG_AMOUNT: RawEIP712SignedOffer = {
  format: 'eip712',
  payload: { ...OFFER_PAYLOAD_WRONG_AMOUNT },
  signature: SIG_EIP712,
};

// ---------------------------------------------------------------------------
// Signed Receipts (EIP-712 format)
// ---------------------------------------------------------------------------

export const RECEIPT_PAYLOAD_VALID: RawReceiptPayload = {
  version: 1,
  network: 'eip155:8453',
  resourceUrl: 'https://api.example.com/weather/london',
  payer: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  issuedAt: Math.floor(Date.now() / 1000),
  transaction: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
};

export const SIGNED_RECEIPT_VALID: RawEIP712SignedReceipt = {
  format: 'eip712',
  payload: { ...RECEIPT_PAYLOAD_VALID },
  signature: SIG_EIP712,
};

// ---------------------------------------------------------------------------
// Full Flow Fixtures
// ---------------------------------------------------------------------------

export const PAYMENT_REQUIRED_VALID: X402OfferReceiptChallenge = {
  accepts: ACCEPTS_SINGLE,
  offers: [SIGNED_OFFER_VALID],
  resourceUrl: 'https://api.example.com/weather/london',
};

export const PAYMENT_REQUIRED_NO_INDEX: X402OfferReceiptChallenge = {
  accepts: ACCEPTS_SINGLE,
  offers: [SIGNED_OFFER_NO_INDEX],
  resourceUrl: 'https://api.example.com/weather/london',
};

export const PAYMENT_REQUIRED_MULTI_ACCEPTS: X402OfferReceiptChallenge = {
  accepts: ACCEPTS_MULTI,
  offers: [SIGNED_OFFER_VALID],
};

export const SETTLEMENT_RESPONSE_VALID: X402SettlementResponse = {
  receipt: SIGNED_RECEIPT_VALID,
  resourceUrl: 'https://api.example.com/weather/london',
};
