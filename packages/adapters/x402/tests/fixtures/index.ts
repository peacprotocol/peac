/**
 * Test fixtures for x402 adapter conformance tests
 *
 * These fixtures cover the risky edges:
 * - acceptIndex out-of-range
 * - acceptIndex points to non-matching accept terms
 * - acceptIndex omitted, unique match exists
 * - acceptIndex omitted, multiple matches (reject)
 * - validUntil expired
 * - payload version unsupported
 * - replay/tamper: modified acceptIndex (must not matter), modified payload
 */

import type {
  SignedOffer,
  SignedReceipt,
  AcceptEntry,
  X402PaymentRequired,
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
};

export const ACCEPT_ETH: AcceptEntry = {
  network: 'eip155:8453',
  asset: 'ETH',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '500000000000000000',
};

export const ACCEPT_SOLANA: AcceptEntry = {
  network: 'solana:mainnet',
  asset: 'USDC',
  payTo: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV',
  amount: '1000000',
};

export const ACCEPTS_SINGLE = [ACCEPT_BASE];
export const ACCEPTS_MULTI = [ACCEPT_BASE, ACCEPT_ETH, ACCEPT_SOLANA];
export const ACCEPTS_DUPLICATE = [ACCEPT_BASE, { ...ACCEPT_BASE }];

// ---------------------------------------------------------------------------
// Valid Offer Payloads
// ---------------------------------------------------------------------------

/** Matching the BASE accept entry */
export const OFFER_PAYLOAD_VALID = {
  version: '1',
  validUntil: Math.floor(Date.now() / 1000) + 3600,
  network: 'eip155:8453',
  asset: 'USDC',
  amount: '1000000',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
} as const;

/** Expired offer (validUntil in the past) */
export const OFFER_PAYLOAD_EXPIRED = {
  ...OFFER_PAYLOAD_VALID,
  validUntil: Math.floor(Date.now() / 1000) - 3600,
} as const;

/** Unsupported version */
export const OFFER_PAYLOAD_BAD_VERSION = {
  ...OFFER_PAYLOAD_VALID,
  version: '99',
} as const;

/** Mismatched network (doesn't match any accept entry) */
export const OFFER_PAYLOAD_WRONG_NETWORK = {
  ...OFFER_PAYLOAD_VALID,
  network: 'eip155:1',
} as const;

/** Mismatched amount */
export const OFFER_PAYLOAD_WRONG_AMOUNT = {
  ...OFFER_PAYLOAD_VALID,
  amount: '9999999',
} as const;

// ---------------------------------------------------------------------------
// Valid Signatures (structural only -- NOT cryptographically valid)
// ---------------------------------------------------------------------------

/** Dummy EIP-712 signature (65 bytes hex) */
export const SIG_EIP712 = '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1b';

/** Dummy JWS compact signature (header.payload.signature) */
export const SIG_JWS =
  'eyJhbGciOiJFUzI1NiJ9.eyJ0ZXN0IjoiZGF0YSJ9.MEUCIQC_signature_placeholder_base64url';

// Manually construct a valid JWS-like string
export const SIG_JWS_VALID = 'eyJhbGciOiJFUzI1NiJ9.eyJ0ZXN0IjoiZGF0YSJ9.dGVzdHNpZ25hdHVyZQ';

// ---------------------------------------------------------------------------
// Signed Offers
// ---------------------------------------------------------------------------

export const SIGNED_OFFER_VALID: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_VALID },
  signature: SIG_EIP712,
  format: 'eip712',
};

export const SIGNED_OFFER_JWS: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_VALID },
  signature: SIG_JWS_VALID,
  format: 'jws',
};

export const SIGNED_OFFER_EXPIRED: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_EXPIRED },
  signature: SIG_EIP712,
  format: 'eip712',
};

export const SIGNED_OFFER_BAD_VERSION: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_BAD_VERSION },
  signature: SIG_EIP712,
  format: 'eip712',
};

export const SIGNED_OFFER_WRONG_NETWORK: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_WRONG_NETWORK },
  signature: SIG_EIP712,
  format: 'eip712',
};

export const SIGNED_OFFER_WRONG_AMOUNT: SignedOffer = {
  payload: { ...OFFER_PAYLOAD_WRONG_AMOUNT },
  signature: SIG_EIP712,
  format: 'eip712',
};

// ---------------------------------------------------------------------------
// Signed Receipts
// ---------------------------------------------------------------------------

export const SIGNED_RECEIPT_VALID: SignedReceipt = {
  payload: {
    version: '1',
    network: 'eip155:8453',
    txHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    asset: 'USDC',
    amount: '1000000',
    payTo: '0x1234567890abcdef1234567890abcdef12345678',
  },
  signature: SIG_EIP712,
  format: 'eip712',
};

// ---------------------------------------------------------------------------
// Full Flow Fixtures
// ---------------------------------------------------------------------------

export const PAYMENT_REQUIRED_VALID: X402PaymentRequired = {
  accepts: ACCEPTS_SINGLE,
  acceptIndex: 0,
  offer: SIGNED_OFFER_VALID,
  resourceUrl: 'https://api.example.com/weather/london',
};

export const PAYMENT_REQUIRED_NO_INDEX: X402PaymentRequired = {
  accepts: ACCEPTS_SINGLE,
  offer: SIGNED_OFFER_VALID,
  resourceUrl: 'https://api.example.com/weather/london',
};

export const PAYMENT_REQUIRED_MULTI_ACCEPTS: X402PaymentRequired = {
  accepts: ACCEPTS_MULTI,
  acceptIndex: 0,
  offer: SIGNED_OFFER_VALID,
};

export const SETTLEMENT_RESPONSE_VALID: X402SettlementResponse = {
  receipt: SIGNED_RECEIPT_VALID,
  resourceUrl: 'https://api.example.com/weather/london',
};
