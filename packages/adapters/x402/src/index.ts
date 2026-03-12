/**
 * @peac/adapter-x402
 *
 * Verification, term-matching, and evidence mapping for the
 * x402 Offer/Receipt extension (compatible with upstream coinbase/x402).
 *
 * Architecture:
 * - Layer A (raw.ts): Exact upstream wire types and extraction
 * - Layer B (normalize.ts): Semantic normalization (EIP-712 placeholders)
 * - Layer C (map.ts): PEAC evidence mapping
 * - Verification (verify.ts): Layered verification API
 *
 * @packageDocumentation
 */

// Raw wire types and extraction (Layer A)
export type {
  RawOfferPayload,
  RawReceiptPayload,
  RawJWSSignedOffer,
  RawEIP712SignedOffer,
  RawSignedOffer,
  RawJWSSignedReceipt,
  RawEIP712SignedReceipt,
  RawSignedReceipt,
  RawX402ExtensionInfo,
  ParsedCompactJWS,
} from './raw.js';

export {
  OFFER_RECEIPT,
  MAX_COMPACT_JWS_BYTES,
  X402_RECEIPT_HEADERS,
  parseCompactJWS,
  extractOfferPayload,
  extractReceiptPayload,
  extractExtensionInfo,
  extractReceiptFromHeaders,
} from './raw.js';

// Normalized types and functions (Layer B)
export type { NormalizedOfferPayload, NormalizedReceiptPayload } from './normalize.js';

export { normalizeOfferPayload, normalizeReceiptPayload } from './normalize.js';

// Public types (Layer B aliases + adapter-specific)
export type {
  SignatureFormat,
  OfferPayload,
  SignedOffer,
  ReceiptPayload,
  SignedReceipt,
  AcceptEntry,
  X402OfferReceiptChallenge,
  X402SettlementResponse,
  WireVerification,
  OfferVerification,
  ReceiptVerification,
  ConsistencyVerification,
  ConsistencyOptions,
  VerificationError,
  VerificationStatus,
  X402PeacRecord,
  X402AdapterConfig,
  MismatchPolicy,
  AddressComparator,
  CryptoResult,
  CryptoVerifier,
  EIP712Domain,
  SignerAuthorizer,
  AuthorizationContext,
  AuthorizationResult,
} from './types.js';

// Constants and functions from types
export {
  X402_OFFER_RECEIPT_PROFILE,
  MAX_ACCEPT_ENTRIES,
  MAX_TOTAL_ACCEPTS_BYTES,
  MAX_AMOUNT_LENGTH,
  defaultAddressComparator,
} from './types.js';

// Re-export shared types
export type { Result, AdapterError, AdapterErrorCode, JsonObject } from './types.js';

// Errors
export { X402Error } from './errors.js';
export type { X402ErrorCode } from './errors.js';

// Verification
export {
  verifyOffer,
  verifyReceipt,
  verifyOfferWire,
  verifyReceiptWire,
  verifyOfferReceiptConsistency,
  matchAcceptTerms,
  selectAccept,
} from './verify.js';

// Mapping
export { toPeacRecord, toPeacCarrier } from './map.js';

// Evidence Carrier Contract (v0.11.1+ DD-124)
export type {
  X402HeaderMap,
  X402ResponseLike,
  X402ExtractResult,
  X402ExtractAsyncResult,
} from './carrier.js';

export {
  X402_CARRIER_LIMITS,
  fromOfferResponse,
  fromOfferResponseAsync,
  fromSettlementResponse,
  fromSettlementResponseAsync,
  X402CarrierAdapter,
} from './carrier.js';

// Challenge type mapping
export type { ChallengeType } from './challenge.js';
export { mapX402ToChallengeType } from './challenge.js';
