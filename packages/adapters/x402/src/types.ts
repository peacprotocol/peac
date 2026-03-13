/**
 * x402 Offer/Receipt extension types
 *
 * Public API types for the x402 adapter. Uses raw wire types (Layer A)
 * and normalized types (Layer B) from their respective modules.
 *
 * @packageDocumentation
 */

// Re-export raw wire types (Layer A) for wire-compatibility consumers
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

// Re-export normalized types (Layer B)
export type { NormalizedOfferPayload, NormalizedReceiptPayload } from './normalize.js';

// Re-export shared types from adapter-core
export type { Result, AdapterError, AdapterErrorCode, JsonObject } from '@peac/adapter-core';

// ---------------------------------------------------------------------------
// Profile Identifier
// ---------------------------------------------------------------------------

/**
 * Profile identifier for x402 Offer/Receipt extension records
 *
 * This profile targets the EXTENSION flow (signed offers + signed receipts),
 * NOT the baseline x402 header flow (PAYMENT-REQUIRED, etc.).
 *
 * `peac-x402/0.1` is RESERVED for future baseline header flow support.
 */
export const X402_OFFER_RECEIPT_PROFILE = 'peac-x402-offer-receipt/0.2' as const;

// ---------------------------------------------------------------------------
// DoS Protection Limits
// ---------------------------------------------------------------------------

/**
 * Maximum number of accept entries allowed (DoS protection)
 *
 * Prevents CPU exhaustion from maliciously large accepts arrays.
 * O(n) scan becomes O(128) worst case.
 */
export const MAX_ACCEPT_ENTRIES = 128;

/**
 * Maximum total bytes for accepts array JSON (DoS protection)
 *
 * Prevents memory exhaustion from large accept payloads.
 * 256 KiB is generous for legitimate use cases.
 */
export const MAX_TOTAL_ACCEPTS_BYTES = 256 * 1024; // 256 KiB

/**
 * Maximum length for amount string (prevents arbitrary-precision DoS)
 *
 * 78 chars supports uint256 (Ethereum's max) without truncation.
 */
export const MAX_AMOUNT_LENGTH = 78;

// ---------------------------------------------------------------------------
// Signature Format
// ---------------------------------------------------------------------------

/**
 * Signature format for x402 artifacts
 *
 * - eip712: EIP-712 typed structured data signature (Ethereum)
 * - jws: JWS compact serialization (RFC 7515)
 */
export type SignatureFormat = 'eip712' | 'jws';

// ---------------------------------------------------------------------------
// Public Payload Type Aliases
// ---------------------------------------------------------------------------

// Public types are aliases for normalized types (Layer B output).
// Wire consumers should use RawOfferPayload/RawReceiptPayload directly.

import type { NormalizedOfferPayload, NormalizedReceiptPayload } from './normalize.js';
import type { RawSignedOffer, RawSignedReceipt } from './raw.js';

/**
 * x402 Offer payload (normalized, semantically clean)
 *
 * This is the public-facing offer payload type. EIP-712 placeholders
 * have been normalized to semantic absence.
 */
export type OfferPayload = NormalizedOfferPayload;

/**
 * x402 Receipt payload (normalized, semantically clean)
 *
 * Privacy-minimal: transaction is optional enrichable evidence.
 */
export type ReceiptPayload = NormalizedReceiptPayload;

/**
 * x402 Signed Offer (discriminated union)
 *
 * JWS format: `{ format: 'jws', signature: string }` (payload inside compact JWS)
 * EIP-712: `{ format: 'eip712', payload, signature }` (payload is separate field)
 */
export type SignedOffer = RawSignedOffer;

/**
 * x402 Signed Receipt (discriminated union)
 */
export type SignedReceipt = RawSignedReceipt;

// ---------------------------------------------------------------------------
// Accept Terms
// ---------------------------------------------------------------------------

/**
 * A single accept entry: the terms under which a facilitator accepts payment
 *
 * These are the terms that offers are matched against during verification.
 * Term-matching is the binding mechanism (not acceptIndex).
 */
export interface AcceptEntry {
  /** CAIP-2 network identifier */
  network: string;
  /** Payment asset */
  asset: string;
  /** Payment recipient address */
  payTo: string;
  /** Maximum amount in minor units */
  amount: string;
  /** Settlement scheme (required per upstream) */
  scheme: string;
}

// ---------------------------------------------------------------------------
// x402 Extension Envelope
// ---------------------------------------------------------------------------

/**
 * PEAC's post-extraction convenience type for x402 offer/receipt challenge
 *
 * This is NOT the upstream `PaymentRequired` message type. Upstream's
 * `PaymentRequired` nests extension data under `extensions["offer-receipt"].info`.
 * This type represents the PEAC-side extracted and flattened shape, combining
 * the offers from the extension info with the accepts from the top-level
 * `PaymentRequired`.
 *
 * To convert from upstream wire format:
 * 1. Use `extractExtensionInfo(body)` to pull offers from the raw response
 * 2. Read `accepts` from the top-level `PaymentRequired` message
 * 3. Combine into this convenience type
 *
 * @see extractExtensionInfo - Extracts from upstream `extensions["offer-receipt"].info`
 * @see extractReceiptFromHeaders - Extracts receipt from settlement response headers
 */
export interface X402OfferReceiptChallenge {
  /** List of acceptable payment terms */
  accepts: AcceptEntry[];
  /** Signed offers */
  offers: RawSignedOffer[];
  /** Resource URL being accessed */
  resourceUrl?: string;
}

/**
 * x402 Settlement response with receipt extension
 */
export interface X402SettlementResponse {
  /** Signed receipt proving settlement */
  receipt: RawSignedReceipt;
  /** Resource URL that was accessed */
  resourceUrl?: string;
  /** Reference back to the offer */
  offerRef?: string;
  /**
   * Forward-compatibility: unknown extension fields from x402 evolution
   *
   * Unknown fields are preserved in proofs but NOT copied to evidence.
   */
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Verification Results
// ---------------------------------------------------------------------------

/**
 * Result of wire-level validation
 */
export interface WireVerification {
  /** Whether the wire structure is valid */
  valid: boolean;
  /** Verification errors (if invalid) */
  errors: VerificationError[];
}

/**
 * Result of offer term verification
 */
export interface OfferVerification {
  /** Whether the offer is valid */
  valid: boolean;
  /** The matched accept entry (if valid) */
  matchedAccept?: AcceptEntry;
  /** Index of the matched accept entry */
  matchedIndex?: number;
  /** Whether acceptIndex was used as hint (vs full scan) */
  usedHint: boolean;
  /** Verification errors (if invalid) */
  errors: VerificationError[];
  /**
   * Term-matching details (always populated for deterministic output)
   */
  termMatching: {
    /** Method used: 'hint' (acceptIndex) or 'scan' (full array scan) */
    method: 'hint' | 'scan';
    /** Whether the acceptIndex hint was provided */
    hintProvided: boolean;
    /** Whether the hint pointed to a non-matching entry */
    hintMismatchDetected: boolean;
  };
}

/**
 * Result of receipt semantic verification
 */
export interface ReceiptVerification {
  /** Whether the receipt is valid */
  valid: boolean;
  /** Verification errors (if invalid) */
  errors: VerificationError[];
}

/**
 * Options for offer-receipt consistency verification
 */
export interface ConsistencyOptions {
  /**
   * Candidate payer addresses to verify against receipt.payer
   *
   * If provided, receipt.payer must match one of these addresses
   * (using the network-aware address comparator).
   * Upstream client verification checks payer against wallet addresses.
   */
  payerCandidates?: string[];
  /**
   * Address comparator for payer matching (default: defaultAddressComparator)
   */
  addressComparator?: AddressComparator;
}

/**
 * Result of offer-receipt consistency verification
 */
export interface ConsistencyVerification {
  /** Whether offer and receipt are consistent */
  valid: boolean;
  /** Consistency errors (if inconsistent) */
  errors: VerificationError[];
}

/**
 * Structured verification error
 */
export interface VerificationError {
  /** Error code (from X402ErrorCode) */
  code: string;
  /** Human-readable message */
  message: string;
  /** Field that caused the error */
  field?: string;
}

// ---------------------------------------------------------------------------
// Verification Status Metadata
// ---------------------------------------------------------------------------

/**
 * Verification status metadata
 *
 * Records what verification was performed and how across all layers.
 * CRITICAL: `valid: true` does NOT imply cryptographic signature validity
 * unless a crypto verifier was supplied.
 */
export interface VerificationStatus {
  /** Wire-level structural validation (always performed) */
  structural: true;
  /** Cryptographic signature verification status */
  cryptographic: {
    /** Whether crypto verification was performed */
    verified: boolean;
    /** Why crypto wasn't verified (if not verified) */
    reason?: 'not_checked' | 'verifier_not_supplied' | 'verifier_failed';
    /** Signature format */
    format?: 'eip712' | 'jws';
    /** Signer identity (if verified and available) */
    signer?: string;
  };
  /** Term-matching verification status */
  termMatching: {
    /** Whether a matching accept entry was found */
    matched: boolean;
    /** Method used: 'hint' (acceptIndex) or 'scan' (full scan) */
    method: 'hint' | 'scan';
    /** Index of matched accept entry */
    matchedIndex?: number;
    /** Why term-matching wasn't performed */
    reason?: 'not_verified';
  };
  /** Offer-receipt consistency status */
  consistency?: {
    /** Whether consistency was checked */
    checked: boolean;
    /** Whether offer and receipt are consistent */
    valid?: boolean;
  };
  /** Signer authorization status */
  signerAuthorization?: {
    /** Whether authorization was checked */
    checked: boolean;
    /** Whether the signer is authorized */
    authorized?: boolean;
    /** Authorization method used */
    method?: string;
  };
}

// ---------------------------------------------------------------------------
// PEAC Record (output of mapping, Layer C)
// ---------------------------------------------------------------------------

/**
 * PEAC interaction record for an x402 Offer/Receipt extension flow
 *
 * Produced by mapping x402 proofs into the PEAC evidence layer.
 * Evidence fields are derived from normalized payloads (Layer B).
 * Raw upstream artifacts are preserved as-is in proofs.
 */
export interface X402PeacRecord {
  /** Record format version (extension profile, not baseline) */
  version: typeof X402_OFFER_RECEIPT_PROFILE;
  /**
   * Raw x402 proofs (preserved for audit)
   *
   * These are the exact wire artifacts, never mutated or reconstructed.
   * Proof preservation discipline: raw artifacts in, raw artifacts stored.
   */
  proofs: {
    x402: {
      offer: RawSignedOffer;
      receipt: RawSignedReceipt;
    };
  };
  /** Normalized evidence fields (extracted from signed payloads via Layer B) */
  evidence: {
    /** Resource URL (from offer, signed) */
    resourceUrl: string;
    /** Offer expiry (epoch seconds, from offer; undefined = no expiry) */
    validUntil?: number;
    /** CAIP-2 network */
    network: string;
    /** Payment recipient (neutral naming; x402 calls this "payTo") */
    payee: string;
    /** Payment asset */
    asset: string;
    /** Payment amount in minor units */
    amount: string;
    /** Schema version (from offer, number) */
    offerVersion: number;
    /** Payer address (from receipt) */
    payer?: string;
    /** Receipt issuance timestamp (from receipt, epoch seconds) */
    issuedAt?: number;
    /** On-chain transaction reference (from receipt, optional; privacy-minimal) */
    transaction?: string;
    /** Schema version (from receipt, if present) */
    receiptVersion?: number;
  };
  /** Unsigned metadata and verification status */
  hints: {
    acceptIndex?: {
      /** The acceptIndex value from the offer envelope */
      value: number;
      /** Always true: acceptIndex is outside the signature */
      untrusted: true;
      /** True if acceptIndex pointed to a non-matching entry */
      mismatchDetected?: boolean;
    };
    resourceUrl?: string;
    /**
     * Verification status metadata
     *
     * IMPORTANT: `valid: true` does NOT imply cryptographic signature validity
     * unless verification.cryptographic.verified is true.
     */
    verification?: VerificationStatus;
  };
  /** RFC 8785 JCS + SHA-256 digest of this record */
  digest?: string;
  /** ISO 8601 timestamp of record creation */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Mismatch policy for acceptIndex hint verification
 *
 * Controls behavior when acceptIndex points to an entry that doesn't match
 * the signed offer payload.
 *
 * - 'fail': Reject with accept_term_mismatch error (default, recommended)
 * - 'warn_and_scan': Log warning, continue with scan, record in hints
 * - 'ignore_and_scan': Skip hint check entirely, always scan
 */
export type MismatchPolicy = 'fail' | 'warn_and_scan' | 'ignore_and_scan';

/**
 * Network-aware address comparison function
 *
 * Default behavior:
 * - EVM networks (eip155:*): case-insensitive (EIP-55 mixed-case is cosmetic)
 * - All other networks: exact string comparison (fail-closed for unknown formats)
 *
 * Override via `X402AdapterConfig.addressComparator` or
 * `ConsistencyOptions.addressComparator` for specific network requirements.
 *
 * @param a - First address
 * @param b - Second address
 * @param network - CAIP-2 network identifier
 * @returns True if addresses are equivalent for the given network
 */
export type AddressComparator = (a: string, b: string, network: string) => boolean;

/**
 * Default network-aware address comparator
 *
 * EVM networks (eip155:*): case-insensitive (EIP-55 checksums are cosmetic encoding).
 * All other networks: exact string comparison (fail-closed for unknown formats).
 */
export function defaultAddressComparator(a: string, b: string, network: string): boolean {
  if (network.startsWith('eip155:')) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

/**
 * Adapter configuration
 *
 * Defaults match upstream x402 behavior:
 * - `offerExpiryPolicy: 'allow_missing'` (upstream treats validUntil as optional)
 * - `receiptRecencySeconds: 3600` (upstream client default)
 *
 * Stricter options available via opt-in:
 * - `offerExpiryPolicy: 'require'` rejects offers without expiry
 * - `receiptRecencySeconds: 300` tightens freshness window
 * - `signatureVerificationPolicy: 'require'` mandates crypto verification
 */
export interface X402AdapterConfig {
  /** Supported offer/receipt versions (default: [1]) */
  supportedVersions?: number[];
  /** Clock skew tolerance in seconds for validUntil (default: 60) */
  clockSkewSeconds?: number;
  /** Current time override for testing (epoch seconds) */
  nowSeconds?: number;
  /**
   * How to handle acceptIndex mismatch (default: "fail")
   */
  mismatchPolicy?: MismatchPolicy;
  /**
   * Maximum number of accept entries allowed (default: 128)
   */
  maxAcceptEntries?: number;
  /**
   * Maximum total bytes for accepts array JSON (default: 256 KiB)
   */
  maxTotalAcceptsBytes?: number;
  /**
   * Enable strict CAIP-2 network format validation (default: true)
   */
  strictNetworkValidation?: boolean;
  /**
   * Enable strict amount validation (default: true)
   */
  strictAmountValidation?: boolean;
  /**
   * Offer expiry policy (default: 'allow_missing')
   *
   * Upstream x402 treats validUntil as optional (EIP-712 encodes
   * unused values as `0`). The default matches upstream behavior.
   *
   * - 'allow_missing': accept offers without expiry (default)
   * - 'require': reject offers without expiry
   */
  offerExpiryPolicy?: 'require' | 'allow_missing';
  /**
   * Signature verification policy (default: 'none')
   *
   * - 'none': no crypto verification (structural only)
   * - 'verify_if_configured': verify if CryptoVerifier is supplied
   * - 'require': fail if CryptoVerifier is not supplied
   */
  signatureVerificationPolicy?: 'none' | 'verify_if_configured' | 'require';
  /**
   * Signer authorization policy (default: 'none')
   *
   * - 'none': no signer authorization
   * - 'verify_if_configured': authorize if SignerAuthorizer is supplied
   * - 'require': fail if SignerAuthorizer is not supplied
   */
  signerAuthorizationPolicy?: 'none' | 'verify_if_configured' | 'require';
  /**
   * Address comparator for payTo/payer matching (default: defaultAddressComparator)
   *
   * Network-aware: EVM is case-insensitive, others exact.
   */
  addressComparator?: AddressComparator;
  /**
   * Maximum compact JWS byte length (default: 64 KB)
   */
  maxCompactJwsBytes?: number;
  /**
   * Receipt recency window in seconds (default: 3600)
   *
   * Default matches upstream x402 client (1 hour).
   * Receipts with issuedAt older than this are rejected.
   */
  receiptRecencySeconds?: number;
}

// ---------------------------------------------------------------------------
// Opt-in Crypto Verification Interfaces
// ---------------------------------------------------------------------------

/**
 * Result of cryptographic verification
 */
export interface CryptoResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** Recovered/resolved signer identity */
  signer?: string;
  /** JWS algorithm used (from header, e.g., 'ES256', 'EdDSA') */
  alg?: string;
  /** JWS key ID (from header) */
  kid?: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Opt-in cryptographic verifier interface
 *
 * Callers inject an implementation to enable signature verification.
 * The adapter core has no crypto dependencies.
 *
 * Implementation constraints:
 * - MUST NOT perform live network I/O (no key fetching, no DID resolution)
 * - Key material MUST be provided via injection or pre-fetched
 * - MUST enforce algorithm allowlists (no implicit algorithm trust)
 * - MUST preserve `kid` and `alg` from JWS headers in CryptoResult
 * - If DID-based: use pluggable resolver with caching, allowlists,
 *   timeouts, offline mode, and SSRF controls
 */
export interface CryptoVerifier {
  /** Verify a JWS compact serialization */
  verifyJWS(compactJws: string): Promise<CryptoResult>;
  /** Verify an EIP-712 typed data signature */
  verifyEIP712(payload: unknown, signature: string, domain: EIP712Domain): Promise<CryptoResult>;
}

/**
 * EIP-712 domain parameters for signature verification
 */
export interface EIP712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

/**
 * Opt-in signer authorization interface
 *
 * Determines whether a recovered signer is authorized for a given resource.
 * This is verifier policy, not payload data (per upstream PR #935 conclusion).
 *
 * Implementation constraints:
 * - MUST NOT perform live network I/O in core verification path
 * - Resolver injection only: callers provide pre-fetched or cached material
 * - For `did:web` resolution: require explicit timeout (default 5s),
 *   caching (default 5min), allowlist, and SSRF controls
 * - Results are stored separately from signature verification in record metadata
 */
export interface SignerAuthorizer {
  /** Check if a signer is authorized for a resource */
  authorize(
    signer: string,
    resourceUrl: string,
    context: AuthorizationContext
  ): Promise<AuthorizationResult>;
}

/**
 * Context provided to the signer authorizer
 *
 * Preserves `kid` and `alg` from JWS headers for authorization decisions.
 */
export interface AuthorizationContext {
  /** CAIP-2 network identifier */
  network: string;
  /** Signature format */
  format: 'jws' | 'eip712';
  /** JWS kid header value (if JWS format) */
  kid?: string;
  /** JWS algorithm (from header, e.g., 'ES256', 'EdDSA') */
  alg?: string;
}

/**
 * Result of signer authorization
 */
export interface AuthorizationResult {
  /** Whether the signer is authorized */
  authorized: boolean;
  /** Authorization method used (e.g., 'dns-txt', 'did-web', 'erc-8004', 'manual') */
  method?: string;
  /** Reason for authorization decision */
  reason?: string;
}
