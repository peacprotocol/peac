/**
 * PEAC Evidence Types
 *
 * Payment and attestation evidence for receipts.
 */

/**
 * Payment rail identifier (vendor-neutral string)
 *
 * Common rails (see docs/specs/registries.json):
 * - "x402" - HTTP 402 paid calls
 * - "l402" - Lightning HTTP 402 (LSAT)
 * - "card-network" - Generic card networks
 * - "upi" - Unified Payments Interface
 *
 * Rail identifiers are opaque strings. Vendor-specific details
 * belong in payment.evidence or adapter packages (@peac/rails-*).
 */
export type PaymentRailId = string;

/**
 * @deprecated Use PaymentRailId. Type renamed in v0.9.15. Will be removed in v0.9.17.
 */
export type PaymentScheme = PaymentRailId;

/**
 * Payment evidence - rail-agnostic normalized payment
 *
 * All payment rails MUST produce this normalized structure.
 * Rail-specific details go in the `evidence` field.
 *
 * Invariants:
 * - `asset` and `env` are REQUIRED
 * - `network` is OPTIONAL but SHOULD be provided for crypto rails
 * - `facilitator_ref` is OPTIONAL
 * - `evidence` is opaque in v0.9; may become discriminated union in v1.0
 */
export interface PaymentEvidence {
  /** Payment rail identifier */
  rail: PaymentRailId;

  /** Rail-specific payment reference/ID */
  reference: string;

  /** Amount in smallest currency unit (cents, sats, paise, etc.) */
  amount: number;

  /** ISO 4217 currency code (uppercase) */
  currency: string;

  /**
   * Asset transferred (REQUIRED)
   *
   * Examples: "USD", "USDC", "BTC", "INR", "EUR"
   *
   * For crypto: use ticker symbol
   * For fiat: use ISO 4217 code
   */
  asset: string;

  /**
   * Environment (REQUIRED)
   *
   * - "live": Production/real money
   * - "test": Sandbox/test mode
   */
  env: "live" | "test";

  /**
   * Network/rail identifier (OPTIONAL, SHOULD for crypto)
   *
   * Examples:
   * - "lightning" - Bitcoin Lightning Network
   * - "base-mainnet" - Base (Coinbase L2)
   * - "solana" - Solana mainnet
   * - "upi" - Unified Payments Interface (India)
   * - "ach" - ACH network (US)
   *
   * Not applicable for traditional payment processors.
   */
  network?: string;

  /**
   * Facilitator reference (OPTIONAL)
   *
   * Stable identifier for the PSP/facilitator processing this payment.
   *
   * Examples:
   * - "acct_1234567890"
   * - "facilitator_account_xyz"
   * - "acc_ABC123"
   */
  facilitator_ref?: string;

  /**
   * Rail-specific evidence (opaque in v0.9)
   *
   * Structure varies by rail. Examples:
   *
   * x402/Lightning:
   * {
   *   "preimage": "...",
   *   "invoice": "lnbc...",
   *   "settled_at": 1234567890,
   *   "node_id": "03..."
   * }
   *
   * Traditional payment processor:
   * {
   *   "payment_intent": "pi_...",
   *   "session_id": "cs_...",
   *   "payment_method": "pm_...",
   *   "customer_id": "cus_..."
   * }
   *
   * UPI:
   * {
   *   "vpa": "user@bank",
   *   "txn_id": "...",
   *   "approver": "..."
   * }
   *
   * Future: May become discriminated union in v1.0.
   */
  evidence: unknown;
}

/**
 * Attestation evidence - TEE/platform attestation
 *
 * Used for proving the execution environment or platform
 * properties of the issuer/verifier.
 *
 * Examples:
 * - TPM attestation
 * - SGX attestation
 * - AWS Nitro Enclaves
 * - SEV-SNP attestation
 */
export interface AttestationEvidence {
  /**
   * Attestation format
   *
   * Well-known formats:
   * - "tpm2.0" - TPM 2.0 attestation
   * - "sgx" - Intel SGX attestation
   * - "sev-snp" - AMD SEV-SNP attestation
   * - "nitro" - AWS Nitro Enclaves
   * - "custom" - Custom attestation format
   */
  format: string;

  /**
   * Attestation-specific evidence
   *
   * Structure varies by format. Examples:
   *
   * TPM 2.0:
   * {
   *   "pcr_values": {...},
   *   "quote": "...",
   *   "signature": "..."
   * }
   *
   * SGX:
   * {
   *   "quote": "...",
   *   "mrenclave": "...",
   *   "mrsigner": "..."
   * }
   */
  evidence: unknown;
}
