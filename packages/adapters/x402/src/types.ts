/**
 * x402 Offer/Receipt extension types
 *
 * Models the x402 offer/receipt flow as defined by the spec:
 * - SignedOffer: EIP-712 or JWS signed payment terms
 * - SignedReceipt: Settlement proof binding offer to on-chain transaction
 * - AcceptEntry: Terms an offer can match against
 * - acceptIndex: Unsigned envelope field (hint only, not binding)
 *
 * Key decisions from x402 PR #935:
 * - validUntil: epoch seconds in signed payload
 * - version: in signed payload
 * - acceptIndex: unsigned envelope field (outside signature)
 * - metadata: deferred to v2
 *
 * NOTE: This adapter targets the x402 Offer/Receipt EXTENSION (PR #935),
 * NOT the baseline x402 header flow. The profile identifier reflects this:
 * `peac-x402-offer-receipt/0.1` (extension) vs `peac-x402/0.1` (baseline, reserved).
 */

import type { JsonObject } from '@peac/kernel';

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
export const X402_OFFER_RECEIPT_PROFILE = 'peac-x402-offer-receipt/0.1' as const;

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
// x402 Signed Artifacts
// ---------------------------------------------------------------------------

/**
 * Signature format for x402 artifacts
 *
 * - eip712: EIP-712 typed structured data signature (Ethereum)
 * - jws: JWS compact serialization (RFC 7515)
 */
export type SignatureFormat = 'eip712' | 'jws';

/**
 * x402 Offer payload (inside the signed envelope)
 *
 * These fields are cryptographically bound by the signature.
 * Any modification invalidates the signature.
 */
export interface OfferPayload {
  /** Schema version (in signed payload per PR #935) */
  version: string;
  /** Offer expiry as epoch seconds (in signed payload per PR #935) */
  validUntil: number;
  /** CAIP-2 network identifier (e.g., "eip155:8453") */
  network: string;
  /** Payment asset identifier (e.g., "USDC", "ETH") */
  asset: string;
  /** Payment amount in minor units */
  amount: string;
  /** Payment recipient address */
  payTo: string;
  /** Settlement scheme (e.g., "exact", "flexible") */
  scheme?: string;
  /** Settlement parameters (scheme-specific) */
  settlement?: JsonObject;
}

/**
 * x402 Signed Offer (envelope)
 *
 * The offer envelope contains:
 * - payload: signed content (cryptographically bound)
 * - signature: EIP-712 or JWS signature over the payload
 * - format: which signature scheme was used
 */
export interface SignedOffer {
  /** The signed payload */
  payload: OfferPayload;
  /** Signature over the payload */
  signature: string;
  /** Signature format */
  format: SignatureFormat;
}

/**
 * x402 Receipt payload (inside the signed envelope)
 */
export interface ReceiptPayload {
  /** Schema version */
  version: string;
  /** CAIP-2 network identifier */
  network: string;
  /** On-chain transaction hash */
  txHash: string;
  /** Payment asset */
  asset?: string;
  /** Payment amount in minor units */
  amount?: string;
  /** Payment recipient */
  payTo?: string;
}

/**
 * x402 Signed Receipt (envelope)
 */
export interface SignedReceipt {
  /** The signed payload */
  payload: ReceiptPayload;
  /** Signature over the payload */
  signature: string;
  /** Signature format */
  format: SignatureFormat;
}

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
  /** Settlement scheme */
  scheme?: string;
  /** Settlement parameters */
  settlement?: JsonObject;
}

// ---------------------------------------------------------------------------
// x402 Extension Envelope
// ---------------------------------------------------------------------------

/**
 * x402 PaymentRequired response with offer/receipt extension
 *
 * This is the 402 response sent by the resource server.
 * The extension data lives under extensions["offer-receipt"].
 */
export interface X402PaymentRequired {
  /** List of acceptable payment terms */
  accepts: AcceptEntry[];
  /**
   * Index into accepts[] that the offer targets.
   *
   * IMPORTANT: This field is OUTSIDE the signed payload (unsigned envelope).
   * Verifiers MUST NOT rely on it as binding.
   * Treat as advisory hint only; always verify via term-matching.
   */
  acceptIndex?: number;
  /** Signed offer */
  offer: SignedOffer;
  /** Resource URL being accessed */
  resourceUrl?: string;
}

/**
 * x402 Settlement response with receipt extension
 */
export interface X402SettlementResponse {
  /** Signed receipt proving settlement */
  receipt: SignedReceipt;
  /** Resource URL that was accessed */
  resourceUrl?: string;
  /** Reference back to the offer */
  offerRef?: string;
  /**
   * Forward-compatibility: unknown extension fields from x402 evolution
   *
   * This allows the adapter to tolerate additions from upstream PRs
   * (e.g., #1004 TXID, #1015 fee extensions) without breaking.
   * Unknown fields are preserved in proofs but NOT copied to evidence.
   */
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Verification Results
// ---------------------------------------------------------------------------

/**
 * Result of offer verification
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
   *
   * This makes mismatchDetected first-class in the verification output,
   * rather than requiring callers to pass it externally.
   *
   * All fields are required booleans for predictable downstream processing.
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
 * Result of receipt verification
 */
export interface ReceiptVerification {
  /** Whether the receipt is valid */
  valid: boolean;
  /** Verification errors (if invalid) */
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
// PEAC Record (output of mapping)
// ---------------------------------------------------------------------------

/**
 * Verification status metadata
 *
 * Records what verification was performed and how.
 * CRITICAL: `valid: true` from verifyOffer/verifyReceipt does NOT imply
 * cryptographic signature validity unless a crypto verifier was supplied.
 */
export interface VerificationStatus {
  /** Structural validation always performed by this adapter */
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
  };
}

/**
 * PEAC interaction record for an x402 Offer/Receipt extension flow
 *
 * This is the canonical record produced by mapping x402 proofs
 * into the PEAC evidence layer.
 *
 * NOTE: This profile targets the x402 Offer/Receipt EXTENSION (PR #935),
 * NOT the baseline x402 header flow.
 */
export interface X402PeacRecord {
  /** Record format version (extension profile, not baseline) */
  version: typeof X402_OFFER_RECEIPT_PROFILE;
  /** Raw x402 proofs (preserved for audit) */
  proofs: {
    x402: {
      offer: SignedOffer;
      receipt: SignedReceipt;
    };
  };
  /** Normalized evidence fields (extracted from signed payloads) */
  evidence: {
    /** Offer expiry (epoch seconds, from signed payload) */
    validUntil: number;
    /** CAIP-2 network */
    network: string;
    /** Payment recipient (neutral naming; x402 calls this "payTo") */
    payee: string;
    /** Payment asset */
    asset: string;
    /** Payment amount in minor units */
    amount: string;
    /** On-chain transaction hash (from receipt) */
    txHash: string;
    /** Schema version (from offer) */
    offerVersion: string;
    /** Schema version (from receipt, if present) */
    receiptVersion?: string;
  };
  /** Unsigned metadata and verification status */
  hints: {
    acceptIndex?: {
      /** The acceptIndex value from the envelope */
      value: number;
      /** Always true -- acceptIndex is outside the signature */
      untrusted: true;
      /** True if acceptIndex pointed to a non-matching entry (when mismatchPolicy != 'fail') */
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
 * Adapter configuration
 *
 * This adapter implements the PaymentProofAdapter interface from @peac/adapter-core.
 * See docs/specs/X402-PROFILE.md for the normative specification.
 */
export interface X402AdapterConfig {
  /** Supported offer versions (default: ["1"]) */
  supportedVersions?: string[];
  /** Clock skew tolerance in seconds for validUntil (default: 60) */
  clockSkewSeconds?: number;
  /** Current time override for testing (epoch seconds) */
  nowSeconds?: number;
  /**
   * How to handle acceptIndex mismatch (default: "fail")
   *
   * When "warn_and_scan" or "ignore_and_scan", the adapter will:
   * 1. Record the mismatch in hints.acceptIndex.mismatchDetected
   * 2. Continue verification via full scan
   * 3. Succeed if scan finds a unique match
   */
  mismatchPolicy?: MismatchPolicy;
  /**
   * Maximum number of accept entries allowed (default: 128)
   *
   * DoS protection: prevents CPU exhaustion from large accepts arrays.
   */
  maxAcceptEntries?: number;
  /**
   * Maximum total bytes for accepts array JSON (default: 256 KiB)
   *
   * DoS protection: prevents memory exhaustion from large payloads.
   * Note: This requires caller to pass raw JSON size if available.
   */
  maxTotalAcceptsBytes?: number;
  /**
   * Enable strict CAIP-2 network format validation (default: true)
   *
   * When enabled, validates network strings match CAIP-2 format (namespace:reference).
   */
  strictNetworkValidation?: boolean;
  /**
   * Enable strict amount validation (default: true)
   *
   * When enabled, validates amount is a non-negative integer string.
   */
  strictAmountValidation?: boolean;
}
