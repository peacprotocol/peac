/**
 * PEAC Control Abstraction Layer (CAL) Types
 *
 * Composable governance for multi-party authorization.
 * Supports TAP, AP2, and custom control engines.
 */

/**
 * Control decision type
 */
export type ControlDecision = 'allow' | 'deny' | 'review';

/**
 * Control purpose - what the access is for
 *
 * Used to map RSL, Content Signals, and other policy dialects
 * to a normalized purpose for receipts.
 *
 * Well-known purposes:
 * - "crawl": Web crawling/scraping
 * - "index": Search engine indexing
 * - "train": AI/ML model training
 * - "inference": AI/ML inference/generation
 * - "ai_input": RAG/grounding (using content as input to AI) [v0.9.17+, RSL alignment]
 * - "ai_index": AI-powered search/indexing [v0.9.18+, RSL 1.0 alignment]
 * - "search": Traditional search indexing [v0.9.17+, RSL alignment]
 *
 * Note: RSL 1.0 uses "ai-index" (not "ai-search"). PEAC maps RSL "ai-index" to
 * "ai_index". Previous versions used "ai_search" which has been removed.
 *
 * @see https://rslstandard.org/rsl for RSL 1.0 specification
 */
export type ControlPurpose =
  | 'crawl'
  | 'index'
  | 'train'
  | 'inference'
  | 'ai_input'
  | 'ai_index'
  | 'search';

/**
 * Control licensing mode - how access is licensed
 *
 * Used to capture the commercial arrangement for access.
 *
 * Well-known modes:
 * - "subscription": Access via active subscription
 * - "pay_per_crawl": Per-crawl payment
 * - "pay_per_inference": Per-inference payment
 */
export type ControlLicensingMode = 'subscription' | 'pay_per_crawl' | 'pay_per_inference';

/**
 * Composable control block - multi-party governance
 *
 * Structure:
 * - chain: Ordered list of control decisions from different engines
 * - decision: Final decision (MUST be consistent with chain)
 * - combinator: Logic for combining chain results
 *
 * v0.9.x semantics:
 * - combinator is always "any_can_veto"
 * - If any step has result: "deny", decision MUST be "deny"
 * - If all steps have result: "allow", decision MUST be "allow"
 * - If any step has result: "review" and none "deny", decision MAY be "review"
 */
export interface ControlBlock {
  /** Chain of control decisions (length >= 1) */
  chain: ControlStep[];

  /** Final decision (MUST be consistent with chain) */
  decision: ControlDecision;

  /** Combinator logic (v0.9: only "any_can_veto") */
  combinator?: 'any_can_veto';
}

/**
 * Single control step in governance chain
 *
 * Represents one control engine's decision in a multi-party
 * governance flow. Examples:
 * - Visa TAP mandate decision
 * - Spend control limit check
 * - Google AP2 mandate authorization
 * - Merchant/platform policy enforcement
 * - Payment fraud check
 */
export interface ControlStep {
  /**
   * Control engine identifier
   *
   * Well-known engines:
   * - "spend-control-service" - Spend control mandate engine
   * - "visa-tap" - Visa Trusted Agent Protocol
   * - "google-ap2" - Google Agent Protocol v2
   * - "risk-engine" - Risk scoring
   * - "merchant-policy" - Merchant-specific policy
   * - "platform-policy" - Platform governance
   * - "custom" - Custom engine
   */
  engine: string;

  /** Engine version (optional, for tracking) */
  version?: string;

  /** Policy ID within engine (engine-specific identifier) */
  policy_id?: string;

  /** Decision from this step */
  result: ControlDecision;

  /** Human-readable reason for decision */
  reason?: string;

  /**
   * Purpose of this access (v0.9.16+)
   *
   * Normalized from RSL, Content Signals, ai.txt, etc.
   * Used to capture what the access is for.
   */
  purpose?: ControlPurpose;

  /**
   * Licensing mode for this access (v0.9.16+)
   *
   * Captures the commercial arrangement.
   */
  licensing_mode?: ControlLicensingMode;

  /**
   * Scope of this control step (v0.9.16+)
   *
   * URI pattern(s) or resource identifier(s) this step applies to.
   * Can be a single scope or multiple scopes.
   *
   * Examples:
   * - "https://example.com/api/*"
   * - ["https://example.com/docs/*", "https://example.com/blog/*"]
   */
  scope?: string | string[];

  /**
   * Limits snapshot at time of decision
   *
   * Engine-specific structure capturing the state of limits/rules
   * that were evaluated. Examples:
   * - Spending limits (per-transaction, daily, weekly)
   * - Usage quotas
   * - Rate limits
   * - Authorization scopes
   */
  limits_snapshot?: unknown;

  /**
   * Reference to external evidence (URL or ID)
   *
   * Link to detailed evidence stored by the control engine.
   * Examples:
   * - Visa TAP evidence URL
   * - Fraud report URL
   * - Internal audit log ID
   */
  evidence_ref?: string;
}

/**
 * Control validation result
 */
export interface ControlValidationResult {
  /** Whether control chain is valid */
  valid: boolean;

  /** Validation error if invalid */
  error?: string;

  /** Decision is consistent with chain */
  consistent: boolean;
}
