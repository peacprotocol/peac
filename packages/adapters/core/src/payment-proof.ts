/**
 * Payment Proof Adapter Interface
 *
 * Defines the contract that all payment proof adapters must implement.
 * This interface ensures consistency across different payment protocols
 * (x402, Stripe, UPI, Lightning, etc.) while allowing protocol-specific
 * implementations.
 *
 * @packageDocumentation
 */

import type { Result } from './result.js';
import type { AdapterError } from './types.js';

// ---------------------------------------------------------------------------
// Normalized Evidence Types
// ---------------------------------------------------------------------------

/**
 * Normalized payment terms extracted from proof artifacts
 *
 * This is the common denominator across all payment protocols.
 * Protocol-specific fields belong in the raw proofs, not here.
 */
export interface NormalizedTerms {
  /** Payment asset (e.g., "USDC", "USD", "BTC") */
  asset: string;
  /** Payment amount in minor units as string (to avoid precision loss) */
  amount: string;
  /** Payment recipient identifier (address, account, etc.) */
  payee: string;
  /** Network identifier (CAIP-2 preferred, but protocol-specific allowed) */
  network?: string;
  /** Terms validity window */
  timebounds?: {
    /** Not valid before (epoch seconds) */
    notBefore?: number;
    /** Not valid after (epoch seconds) */
    notAfter?: number;
  };
}

/**
 * Normalized settlement evidence extracted from proof artifacts
 */
export interface NormalizedSettlement {
  /** Settlement reference (tx hash, payment intent ID, etc.) */
  reference: string;
  /** Settlement network (may differ from terms network) */
  network?: string;
  /** Settlement status */
  status: 'confirmed' | 'pending' | 'failed';
  /** Settlement timestamp (epoch seconds) */
  settledAt?: number;
}

// ---------------------------------------------------------------------------
// Verification Results
// ---------------------------------------------------------------------------

/**
 * Result of terms verification
 */
export interface TermsVerification<TRaw = unknown> {
  /** Whether verification passed */
  valid: boolean;
  /** Normalized terms (if valid) */
  terms?: NormalizedTerms;
  /** Raw proof artifact (preserved for audit) */
  raw: TRaw;
  /** Verification errors (if invalid) */
  errors: VerificationError[];
  /** Whether a hint was used for binding (protocol-specific) */
  usedHint?: boolean;
}

/**
 * Result of settlement verification
 */
export interface SettlementVerification<TRaw = unknown> {
  /** Whether verification passed */
  valid: boolean;
  /** Normalized settlement (if valid) */
  settlement?: NormalizedSettlement;
  /** Raw proof artifact (preserved for audit) */
  raw: TRaw;
  /** Verification errors (if invalid) */
  errors: VerificationError[];
}

/**
 * Structured verification error
 */
export interface VerificationError {
  /** Machine-readable error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Field that caused the error */
  field?: string;
}

// ---------------------------------------------------------------------------
// PEAC Record Types
// ---------------------------------------------------------------------------

/**
 * Base PEAC record structure for payment proofs
 *
 * Adapters extend this with protocol-specific fields in `proofs` and `hints`.
 */
export interface PaymentProofRecord<TProofs = unknown, THints = unknown> {
  /** Profile identifier (e.g., "peac-x402-offer-receipt/0.1") */
  version: string;
  /** Raw proof artifacts (preserved for audit) */
  proofs: TProofs;
  /** Normalized evidence fields */
  evidence: {
    /** From terms */
    asset: string;
    amount: string;
    payee: string;
    network?: string;
    validUntil?: number;
    /** From settlement */
    reference?: string;
    settledAt?: number;
  };
  /** Protocol-specific hints (marked as untrusted where appropriate) */
  hints: THints;
  /** RFC 8785 JCS + SHA-256 digest */
  digest?: string;
  /** ISO 8601 timestamp of record creation */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

/**
 * Verification context provided to adapter methods
 */
export interface VerificationContext {
  /** Current time override (epoch seconds, for testing) */
  nowSeconds?: number;
  /** Clock skew tolerance in seconds */
  clockSkewSeconds?: number;
  /** Mismatch policy for hint-based binding */
  mismatchPolicy?: 'fail' | 'warn_and_scan' | 'ignore_and_scan';
}

/**
 * Payment Proof Adapter Interface
 *
 * All payment proof adapters must implement this interface.
 * This ensures a consistent API surface across different payment protocols.
 *
 * @typeParam TTermsInput - Protocol-specific terms input type
 * @typeParam TSettlementInput - Protocol-specific settlement input type
 * @typeParam TTermsRaw - Protocol-specific raw terms artifact type
 * @typeParam TSettlementRaw - Protocol-specific raw settlement artifact type
 * @typeParam TRecord - Protocol-specific PEAC record type
 *
 * @example
 * // x402 adapter implements this interface
 * const adapter: PaymentProofAdapter<
 *   X402PaymentRequired,
 *   X402SettlementResponse,
 *   SignedOffer,
 *   SignedReceipt,
 *   X402PeacRecord
 * > = {
 *   profileId: 'peac-x402-offer-receipt/0.1',
 *   verifyTerms: (input, ctx) => { ... },
 *   verifySettlement: (input, ctx) => { ... },
 *   toRecord: (terms, settlement) => { ... },
 * };
 */
export interface PaymentProofAdapter<
  TTermsInput = unknown,
  TSettlementInput = unknown,
  TTermsRaw = unknown,
  TSettlementRaw = unknown,
  TRecord extends PaymentProofRecord = PaymentProofRecord,
> {
  /**
   * Profile identifier for this adapter
   *
   * Format: "peac-{protocol}/{version}" (e.g., "peac-x402-offer-receipt/0.1")
   */
  readonly profileId: string;

  /**
   * Verify payment terms
   *
   * Performs structural validation, expiry checks, and protocol-specific
   * binding verification (e.g., term-matching for x402).
   *
   * Does NOT perform cryptographic signature verification unless
   * a crypto verifier is injected via context.
   *
   * @param input - Protocol-specific terms input
   * @param context - Verification context (optional)
   * @returns Verification result with normalized terms
   */
  verifyTerms(
    input: TTermsInput,
    context?: VerificationContext
  ): Result<TermsVerification<TTermsRaw>, AdapterError>;

  /**
   * Verify settlement proof
   *
   * Performs structural validation of the settlement artifact.
   *
   * Does NOT verify on-chain settlement status - that is the caller's
   * responsibility via chain RPC.
   *
   * @param input - Protocol-specific settlement input
   * @param context - Verification context (optional)
   * @returns Verification result with normalized settlement
   */
  verifySettlement(
    input: TSettlementInput,
    context?: VerificationContext
  ): Result<SettlementVerification<TSettlementRaw>, AdapterError>;

  /**
   * Map verified proofs to a PEAC record
   *
   * @param terms - Verified terms result
   * @param settlement - Verified settlement result
   * @returns PEAC record with normalized evidence and raw proofs
   */
  toRecord(
    terms: TermsVerification<TTermsRaw>,
    settlement: SettlementVerification<TSettlementRaw>
  ): Result<TRecord, AdapterError>;
}

// ---------------------------------------------------------------------------
// Optional Crypto Verifier Interface
// ---------------------------------------------------------------------------

/**
 * Optional cryptographic verifier interface
 *
 * Adapters may accept an injected crypto verifier for signature validation.
 * This allows callers to provide protocol-specific verification (EIP-712,
 * JWS, etc.) without the adapter depending on crypto libraries.
 */
export interface CryptoVerifier<TInput = unknown> {
  /**
   * Verify cryptographic signature
   *
   * @param input - Input to verify (protocol-specific)
   * @returns true if signature is valid, false otherwise
   */
  verify(input: TInput): Promise<boolean>;

  /**
   * Get signer identity from verified input
   *
   * @param input - Verified input
   * @returns Signer identifier (address, key ID, etc.)
   */
  getSigner?(input: TInput): Promise<string>;
}
