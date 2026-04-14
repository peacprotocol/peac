/**
 * @peac/adapter-x402
 *
 * Verification, term-matching, and evidence mapping for the
 * x402 Offer/Receipt extension (compatible with upstream x402-foundation/x402).
 *
 * Architecture:
 * - Layer A (raw.ts): Exact upstream wire types and extraction
 * - Layer B (normalize.ts): Semantic normalization (EIP-712 placeholders)
 * - Layer C (map.ts): PEAC evidence mapping
 * - Verification (verify.ts): Layered verification API
 *
 * @packageDocumentation
 */

// Raw wire types and extraction (Layer A, V1)
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

// Raw wire types (Layer A, V2 transport)
export type {
  RawV2Resource,
  RawV2PaymentRequiredAccept,
  RawV2PaymentRequired,
  RawV2PaymentAuthorization,
  RawV2PaymentProofBody,
  RawV2PaymentPayload,
  RawV2SettlementResponseSuccess,
  RawV2SettlementResponseFailure,
  RawV2SettlementResponse,
} from './raw-v2.js';

export { X402_V2_HEADERS } from './raw-v2.js';

// Version detection
export type { X402WireVersion, X402WireVersionDetection } from './version.js';
export { detectX402Version, detectX402VersionFromSource } from './version.js';

// Normalized types and functions (Layer B, V1)
export type { NormalizedOfferPayload, NormalizedReceiptPayload } from './normalize.js';

export { normalizeOfferPayload, normalizeReceiptPayload } from './normalize.js';

// Normalized types and functions (Layer B, V2)
export type { NormalizedV2Offer, NormalizedV2Receipt } from './normalize-v2.js';
export { normalizeV2Offer, normalizeV2Offers, normalizeV2Receipt } from './normalize-v2.js';

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
  verifyOfferV2,
  verifyReceiptV2,
  verifyOfferUnified,
  verifyReceiptUnified,
  verifyOfferWire,
  verifyReceiptWire,
  verifyOfferReceiptConsistency,
  matchAcceptTerms,
  selectAccept,
} from './verify.js';
export type { V2OfferVerification, V2ReceiptVerification } from './verify.js';

// Mapping
export { toPeacRecord, toPeacRecordV2, toPeacCarrier } from './map.js';
export type { ToPeacRecordV2Options } from './map.js';

// Evidence Carrier Contract (v0.11.1+, dual-header read v0.12.4+ DD-193)
export type {
  X402HeaderMap,
  X402ResponseLike,
  X402ExtractResult,
  X402ExtractAsyncResult,
  ReceiptArtifactSource,
  ReceiptArtifactKind,
  ReceiptArtifactFormat,
  ReceiptArtifactResult,
} from './carrier.js';

export {
  X402_CARRIER_LIMITS,
  extractReceiptArtifactFromHeaders,
  fromOfferResponse,
  fromOfferResponseAsync,
  fromSettlementResponse,
  fromSettlementResponseAsync,
  X402CarrierAdapter,
} from './carrier.js';

// Challenge type mapping
export type { ChallengeType } from './challenge.js';
export { mapX402ToChallengeType } from './challenge.js';

// x402 settlement-proof extraction and observation evidence (v0.12.11)
export { extractSettlementProofFromHeaders, fromX402SettlementObservation } from './settlement.js';
export type {
  HeaderBag,
  SettlementProofSource,
  ExtractedSettlementProof,
  X402SettlementObservationInput,
  X402SettlementEvidence,
  X402SettlementOptions,
} from './settlement.js';
