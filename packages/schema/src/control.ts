/**
 * PEAC Control Abstraction Layer (CAL) Types
 *
 * Composable governance for multi-party authorization.
 * Supports TAP, AP2, and custom control engines.
 */

/**
 * Control decision type
 */
export type ControlDecision = "allow" | "deny" | "review";

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
  combinator?: "any_can_veto";
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
   * - "visa-tap" - Visa Token Authentication Protocol
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
