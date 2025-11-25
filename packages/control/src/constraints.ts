/**
 * Generic Control Constraint Types
 *
 * These are informational helper types that control engines MAY use
 * in their limits_snapshot fields. They are NOT part of the normative
 * wire format.
 *
 * Control engines are free to use custom constraint models.
 * These types provide common patterns (temporal, usage, budget)
 * that many engines need.
 */

/**
 * Constraint type identifiers
 */
export type ConstraintType =
  | 'temporal' // Time-based restrictions
  | 'usage' // Usage count restrictions
  | 'budget' // Budget/amount restrictions
  | 'combined'; // Multiple restrictions

/**
 * Temporal constraint - time-based access control
 *
 * Common use cases:
 * - Access only during business hours
 * - Time-limited API keys
 * - Temporary elevated permissions
 */
export interface TemporalConstraint {
  /** Constraint type */
  type: 'temporal';

  /** Access granted from (Unix timestamp seconds) */
  valid_from?: number;

  /** Access expires at (Unix timestamp seconds) */
  valid_until?: number;

  /** Maximum duration in seconds */
  duration?: number;
}

/**
 * Usage constraint - count-based restrictions
 *
 * Common use cases:
 * - Rate limiting (N requests per window)
 * - Quota management (N API calls per month)
 * - One-time use tokens
 */
export interface UsageConstraint {
  /** Constraint type */
  type: 'usage';

  /** Maximum number of uses allowed */
  max_uses: number;

  /** Current usage count (tracked by issuer) */
  current_uses?: number;

  /** Usage window in seconds (optional) */
  window?: number;
}

/**
 * Budget constraint - amount-based restrictions
 *
 * Common use cases:
 * - Spending limits (per transaction, daily, monthly)
 * - Credit limits
 * - Expense controls
 */
export interface BudgetConstraint {
  /** Constraint type */
  type: 'budget';

  /** Maximum amount allowed (smallest currency unit) */
  max_amount: number;

  /** Current spent amount (tracked by issuer) */
  current_amount?: number;

  /** Budget window in seconds (optional) */
  window?: number;

  /** Currency (ISO 4217) */
  currency: string;
}

/**
 * Combined constraint - multiple restrictions
 *
 * Combines temporal, usage, and budget constraints.
 * All specified constraints must be satisfied.
 */
export interface CombinedConstraint {
  /** Constraint type */
  type: 'combined';

  /** Temporal restrictions */
  temporal?: Omit<TemporalConstraint, 'type'>;

  /** Usage restrictions */
  usage?: Omit<UsageConstraint, 'type'>;

  /** Budget restrictions */
  budget?: Omit<BudgetConstraint, 'type'>;
}

/**
 * Constraint union type
 */
export type Constraint =
  | TemporalConstraint
  | UsageConstraint
  | BudgetConstraint
  | CombinedConstraint;

/**
 * Enforcement result from evaluating a constraint
 */
export interface ConstraintEnforcementResult {
  /** Whether the constraint is satisfied */
  allowed: boolean;

  /** Reason if not allowed */
  reason?: string;

  /** Remaining quota information */
  remaining?: {
    uses?: number;
    amount?: number;
    seconds?: number;
  };
}
