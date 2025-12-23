/**
 * Budget enforcement utilities for MCP tool calls
 * Uses bigint for all currency calculations to avoid floating-point errors
 */

export interface BudgetConfig {
  /** Maximum cost per single call in minor currency units (e.g., cents for USD) */
  maxPerCallMinor?: bigint;
  /** Maximum total cost per day in minor currency units */
  maxDailyMinor?: bigint;
  /** Maximum total cost per month in minor currency units */
  maxMonthlyMinor?: bigint;
  /** Currency code (must match at runtime, e.g., 'USD', 'INR') */
  currency: string;
}

export interface BudgetResult {
  /** Whether the cost is allowed within budget limits */
  allowed: boolean;
  /**
   * Remaining budget in minor units (after this operation).
   * - When allowed: the minimum remaining across all applicable limits
   * - When denied: 0n (never negative)
   * - When unbounded: undefined (check `unbounded` flag instead)
   */
  remainingMinor?: bigint;
  /**
   * True when no budget limits are configured.
   * In this case, remainingMinor is undefined.
   */
  unbounded?: boolean;
  /** Error code if not allowed */
  code?: 'budget_exceeded' | 'currency_mismatch';
  /** Human-readable reason if not allowed */
  reason?: string;
}

/**
 * Check if a cost is within budget.
 * Pure, deterministic function - caller tracks time windows externally.
 *
 * @param spentMinor - Amount already spent in minor units (e.g., cents)
 * @param costMinor - Cost of current operation in minor units
 * @param currency - Currency code (must match config.currency)
 * @param config - Budget configuration
 * @returns Result indicating whether cost is allowed and remaining budget
 *
 * @example
 * ```typescript
 * const config: BudgetConfig = {
 *   maxPerCallMinor: 500n, // $5.00 max per call
 *   maxDailyMinor: 10000n, // $100.00 max per day
 *   currency: 'USD'
 * };
 *
 * const result = checkBudget(
 *   8500n, // Already spent $85.00 today
 *   1000n, // Current call costs $10.00
 *   'USD',
 *   config
 * );
 *
 * if (result.allowed) {
 *   console.log(`Allowed. Remaining: ${result.remainingMinor} cents`);
 * } else {
 *   console.log(`Denied: ${result.reason}`);
 * }
 * ```
 */
export function checkBudget(
  spentMinor: bigint,
  costMinor: bigint,
  currency: string,
  config: BudgetConfig
): BudgetResult {
  // Currency mismatch check
  if (currency !== config.currency) {
    return {
      allowed: false,
      remainingMinor: 0n,
      code: 'currency_mismatch',
      reason: `Currency mismatch: expected ${config.currency}, got ${currency}`,
    };
  }

  // Check per-call limit
  if (config.maxPerCallMinor !== undefined && costMinor > config.maxPerCallMinor) {
    return {
      allowed: false,
      remainingMinor: 0n, // Never negative - clamp to 0
      code: 'budget_exceeded',
      reason: `Per-call limit exceeded: cost ${costMinor} > limit ${config.maxPerCallMinor}`,
    };
  }

  // Check daily limit (if configured)
  if (config.maxDailyMinor !== undefined) {
    const newTotal = spentMinor + costMinor;
    if (newTotal > config.maxDailyMinor) {
      return {
        allowed: false,
        remainingMinor: config.maxDailyMinor - spentMinor,
        code: 'budget_exceeded',
        reason: `Daily limit exceeded: total ${newTotal} > limit ${config.maxDailyMinor}`,
      };
    }
  }

  // Check monthly limit (if configured)
  if (config.maxMonthlyMinor !== undefined) {
    const newTotal = spentMinor + costMinor;
    if (newTotal > config.maxMonthlyMinor) {
      return {
        allowed: false,
        remainingMinor: config.maxMonthlyMinor - spentMinor,
        code: 'budget_exceeded',
        reason: `Monthly limit exceeded: total ${newTotal} > limit ${config.maxMonthlyMinor}`,
      };
    }
  }

  // Calculate remaining budget (how much can be spent in future operations)
  // This is the minimum of:
  // 1. Per-call limit (max single operation)
  // 2. Remaining daily budget
  // 3. Remaining monthly budget
  const remainingCandidates: bigint[] = [];

  if (config.maxPerCallMinor !== undefined) {
    remainingCandidates.push(config.maxPerCallMinor);
  }

  if (config.maxDailyMinor !== undefined) {
    const dailyRemaining = config.maxDailyMinor - (spentMinor + costMinor);
    remainingCandidates.push(dailyRemaining);
  }

  if (config.maxMonthlyMinor !== undefined) {
    const monthlyRemaining = config.maxMonthlyMinor - (spentMinor + costMinor);
    remainingCandidates.push(monthlyRemaining);
  }

  // Return the most restrictive limit
  if (remainingCandidates.length === 0) {
    // No limits configured - unbounded
    return {
      allowed: true,
      unbounded: true,
    };
  }

  const remainingMinor = remainingCandidates.reduce((min, val) => (val < min ? val : min));

  return {
    allowed: true,
    remainingMinor,
  };
}
