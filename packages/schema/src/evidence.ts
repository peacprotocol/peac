/**
 * PEAC Evidence Types
 *
 * Payment and attestation evidence for receipts.
 */

import type { JsonValue, JsonObject } from '@peac/kernel';

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
  metadata?: JsonObject;
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
   *
   * v0.9.21+: Changed from JsonObject to JsonValue for flexibility.
   * Runtime validation ensures only JSON-safe values are accepted.
   */
  evidence: JsonValue;

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
   *
   * v0.9.21+: Changed from JsonObject to JsonValue for flexibility.
   */
  evidence: JsonValue;
}

/**
 * Generic attestation from any issuer
 *
 * A flexible container for various types of attestations:
 * - Risk assessments (fraud, bot detection, abuse)
 * - Compliance attestations (KYC, AML, jurisdiction)
 * - Provenance attestations (content origin, model attestation)
 * - Platform attestations (TEE, enclave verification)
 *
 * Invariants:
 * - `issuer`, `type`, `issued_at`, `evidence` are REQUIRED
 * - `expires_at` and `ref` are OPTIONAL
 * - `evidence` is opaque (type-specific data)
 *
 * This is a generic slot for third-party claims. Specific attestation
 * types (like risk_assessment) define their evidence schema by convention.
 *
 * v0.9.21+: Added in schema_set_version 0.9.21.
 */
export interface Attestation {
  /**
   * Issuer identifier (REQUIRED)
   *
   * Who issued this attestation. Examples:
   * - "did:web:issuer.example" - DID-based issuer
   * - "https://cloudflare.com" - URI-based issuer
   * - "cloudflare" - Opaque string identifier
   */
  issuer: string;

  /**
   * Attestation type (REQUIRED)
   *
   * What kind of attestation this is. Examples:
   * - "risk_assessment" - Risk/fraud assessment
   * - "kyc" - Know Your Customer verification
   * - "compliance" - Regulatory compliance
   * - "provenance" - Content/model provenance
   * - "platform" - Platform/TEE attestation
   */
  type: string;

  /**
   * When the attestation was issued (REQUIRED)
   *
   * RFC 3339 / ISO 8601 UTC timestamp.
   */
  issued_at: string;

  /**
   * When the attestation expires (OPTIONAL)
   *
   * RFC 3339 / ISO 8601 UTC timestamp.
   * Omit for non-expiring attestations.
   */
  expires_at?: string;

  /**
   * Reference URI for the attestation (OPTIONAL)
   *
   * Link to more details, verification endpoint, or the attestation itself.
   */
  ref?: string;

  /**
   * Type-specific attestation data (REQUIRED)
   *
   * Structure varies by type. Examples:
   *
   * risk_assessment:
   * {
   *   "provider": "cloudflare",
   *   "category": "bot",
   *   "outcome": "allow",
   *   "score": 0.15,
   *   "confidence": 0.95
   * }
   *
   * kyc:
   * {
   *   "level": "enhanced",
   *   "jurisdiction": "US",
   *   "verified_fields": ["name", "address", "dob"]
   * }
   *
   * provenance:
   * {
   *   "model": "gpt-4",
   *   "version": "2024-01",
   *   "content_hash": "sha256:..."
   * }
   */
  evidence: JsonValue;
}

/**
 * Namespaced extensions object
 *
 * Keys must be namespaced (e.g., "com.example/field", "io.vendor/data").
 * This provides a forward-compatible extension mechanism for all blocks
 * that use `additionalProperties: false`.
 *
 * v0.9.21+: Added in schema_set_version 0.9.21.
 */
export interface Extensions {
  [key: string]: JsonValue;
}
