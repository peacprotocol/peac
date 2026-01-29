/**
 * @peac/adapter-x402
 *
 * x402 Offer/Receipt extension verification, term-matching, and PEAC record mapping.
 *
 * NOTE: This adapter targets the x402 Offer/Receipt EXTENSION,
 * NOT the baseline x402 header flow. The profile identifier reflects this:
 * `peac-x402-offer-receipt/0.1` (extension) vs `peac-x402/0.1` (baseline, reserved).
 *
 * Key capabilities:
 * - Structural validation of x402 offers and receipts
 * - Term-matching: verify signed payload against accept entries
 * - Accept selection with acceptIndex as untrusted hint
 * - Mapping to canonical PEAC interaction records
 * - DoS protection: limits on accepts array size
 * - Amount/network validation: CAIP-2 format, integer strings
 *
 * IMPORTANT: This package does NOT perform cryptographic signature verification
 * (EIP-712 recovery, JWS validation). That is the caller's responsibility.
 * `valid: true` does NOT imply cryptographic signature validity unless
 * a CryptoVerifier is supplied and `verification.cryptographic.verified` is true.
 *
 * The focus is on term-matching and record mapping -- the verification
 * layer that makes unsigned acceptIndex irrelevant for security.
 *
 * @packageDocumentation
 */

// Types
export type {
  SignatureFormat,
  OfferPayload,
  SignedOffer,
  ReceiptPayload,
  SignedReceipt,
  AcceptEntry,
  X402PaymentRequired,
  X402SettlementResponse,
  OfferVerification,
  ReceiptVerification,
  VerificationError,
  VerificationStatus,
  X402PeacRecord,
  X402AdapterConfig,
  MismatchPolicy,
} from './types.js';

// Constants
export {
  X402_OFFER_RECEIPT_PROFILE,
  MAX_ACCEPT_ENTRIES,
  MAX_TOTAL_ACCEPTS_BYTES,
  MAX_AMOUNT_LENGTH,
} from './types.js';

// Re-export shared types
export type { Result, AdapterError, AdapterErrorCode, JsonObject } from './types.js';

// Errors
export { X402Error } from './errors.js';
export type { X402ErrorCode } from './errors.js';

// Verification
export { verifyOffer, verifyReceipt, matchAcceptTerms, selectAccept } from './verify.js';

// Mapping
export { toPeacRecord } from './map.js';
