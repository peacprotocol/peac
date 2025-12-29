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
 * Payment split - allocation of payment to a party
 *
 * Used for marketplace/aggregator scenarios where a single payment
 * is split among multiple parties (platform, merchant, affiliates, etc.)
 *
 * Invariants:
 * - `party` is REQUIRED (identifies the recipient)
 * - `amount` if present MUST be >= 0
 * - `share` if present MUST be in [0,1]
 * - At least one of `amount` or `share` MUST be specified
 *
 * Note: The sum of splits is NOT enforced to equal the total payment amount.
 * This is by design - partial splits, fees, and platform-specific allocation
 * logic are all valid use cases.
 */
export interface PaymentSplit {
  /**
   * Party identifier (REQUIRED)
   *
   * Identifies the recipient of this split. Examples:
   * - "merchant" - Primary merchant
   * - "platform" - Platform fee
   * - "affiliate:partner_123" - Affiliate/referral
   * - "tax" - Tax authority
   */
  party: string;

  /**
   * Absolute amount in smallest currency unit (OPTIONAL)
   *
   * Must be >= 0 if specified.
   * Examples: 1000 (for $10.00 in USD), 50000 (for 500.00 INR)
   */
  amount?: number;

  /**
   * ISO 4217 currency code (OPTIONAL)
   *
   * Uppercase 3-letter code. Defaults to parent payment's currency if omitted.
   */
  currency?: string;

  /**
   * Fractional share of the total (OPTIONAL)
   *
   * Must be in [0,1] if specified.
   * Examples: 0.8 (80%), 0.15 (15%), 0.05 (5%)
   */
  share?: number;

  /**
   * Payment rail for this split (OPTIONAL)
   *
   * If different from parent payment's rail.
   */
  rail?: PaymentRailId;

  /**
   * Account reference for the recipient (OPTIONAL)
   *
   * Examples:
   * - "acct_merchant_abc" - Merchant account
   * - "upi:merchant@bank" - UPI VPA
   * - "wallet_xyz" - Wallet ID
   */
  account_ref?: string;

  /**
   * Additional metadata (OPTIONAL)
   *
   * Rail-specific or application-specific data.
   */
  metadata?: Record<string, unknown>;
}

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
  env: 'live' | 'test';

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
   * Facilitator/platform name (OPTIONAL)
   *
   * Identifies the platform or service facilitating payments on a given rail.
   * Used when the rail is a protocol (like "x402") and multiple vendors
   * operate on that protocol.
   *
   * Examples:
   * - "daydreams" - Daydreams AI inference platform
   * - "fluora" - Fluora MCP marketplace
   * - "pinata" - Pinata IPFS gateway
   * - "coinbase" - Coinbase Commerce
   *
   * Note: This is the platform/vendor name, not an account identifier.
   * For account references, use `facilitator_ref`.
   */
  facilitator?: string;

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

  /**
   * Aggregator/marketplace identifier (OPTIONAL)
   *
   * Identifies the platform or aggregator processing this payment
   * on behalf of sub-merchants. Examples:
   * - "marketplace_abc" - Marketplace ID
   * - "platform:uber" - Platform identifier
   * - "aggregator_xyz" - Payment aggregator
   */
  aggregator?: string;

  /**
   * Payment splits (OPTIONAL)
   *
   * Allocation of payment among multiple parties.
   * Used for marketplace scenarios, affiliate payouts,
   * platform fees, tax withholding, etc.
   *
   * Note: Sum of splits is NOT required to equal total amount.
   */
  splits?: PaymentSplit[];

  /**
   * Payment routing mode (OPTIONAL, rail-agnostic)
   *
   * Describes how the payment is routed between payer, aggregator, and merchant.
   * This is a generic hint - specific rails populate it from their native formats.
   *
   * Values:
   * - "direct": Direct payment to merchant (no intermediary)
   * - "callback": Routed via callback URL / payment service
   * - "role": Role-based routing (e.g., "publisher", "platform")
   *
   * Examples of producers:
   * - x402 v2 `payTo.mode` -> routing
   * - Stripe Connect `destination` -> routing = 'direct' or 'callback'
   * - UPI `pa` (payee address) -> routing = 'direct'
   */
  routing?: 'direct' | 'callback' | 'role';
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
