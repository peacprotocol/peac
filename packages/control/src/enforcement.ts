/**
 * PEAC Control Abstraction Layer (CAL) Enforcement
 *
 * Enforcement logic for mandates and control blocks.
 */

import type {
  Constraint,
  ControlState,
  ConstraintEnforcementResult,
  TemporalConstraint,
  UsageConstraint,
  BudgetConstraint,
  CombinedConstraint,
} from './types';

type EnforcementResult = ConstraintEnforcementResult;

/**
 * Enforce temporal mandate
 */
export function enforceTemporalConstraint(
  mandate: TemporalConstraint,
  currentTime: number = Math.floor(Date.now() / 1000)
): EnforcementResult {
  // Check valid_from
  if (mandate.valid_from !== undefined && currentTime < mandate.valid_from) {
    const remaining = mandate.valid_from - currentTime;
    return {
      allowed: false,
      reason: `Access not yet valid (starts in ${remaining}s)`,
      remaining: { seconds: remaining },
    };
  }

  // Check valid_until
  if (mandate.valid_until !== undefined && currentTime > mandate.valid_until) {
    return {
      allowed: false,
      reason: 'Access has expired',
      remaining: { seconds: 0 },
    };
  }

  // Calculate remaining time
  let remainingSeconds: number | undefined;
  if (mandate.valid_until !== undefined) {
    remainingSeconds = mandate.valid_until - currentTime;
  } else if (mandate.duration !== undefined && mandate.valid_from !== undefined) {
    const expiresAt = mandate.valid_from + mandate.duration;
    remainingSeconds = expiresAt - currentTime;
  }

  return {
    allowed: true,
    remaining: remainingSeconds !== undefined ? { seconds: remainingSeconds } : undefined,
  };
}

/**
 * Enforce usage mandate
 */
export function enforceUsageConstraint(
  mandate: UsageConstraint,
  state?: ControlState
): EnforcementResult {
  const currentUses = state?.usage_count ?? mandate.current_uses ?? 0;

  // Check if max uses exceeded
  if (currentUses >= mandate.max_uses) {
    return {
      allowed: false,
      reason: `Usage limit exceeded (${currentUses}/${mandate.max_uses})`,
      remaining: { uses: 0 },
    };
  }

  // Check usage window if specified
  if (mandate.window !== undefined && state?.first_use !== undefined) {
    const currentTime = Math.floor(Date.now() / 1000);
    const windowExpiry = state.first_use + mandate.window;

    if (currentTime > windowExpiry) {
      return {
        allowed: false,
        reason: 'Usage window expired',
        remaining: { uses: 0 },
      };
    }
  }

  const remainingUses = mandate.max_uses - currentUses;

  return {
    allowed: true,
    remaining: { uses: remainingUses },
  };
}

/**
 * Enforce budget mandate
 */
export function enforceBudgetConstraint(
  mandate: BudgetConstraint,
  state?: ControlState,
  requestedAmount?: number
): EnforcementResult {
  const currentAmount = state?.spent_amount ?? mandate.current_amount ?? 0;

  // Check if budget exceeded
  if (currentAmount >= mandate.max_amount) {
    return {
      allowed: false,
      reason: `Budget limit exceeded (${currentAmount}/${mandate.max_amount} ${mandate.currency})`,
      remaining: { amount: 0 },
    };
  }

  // Check if requested amount would exceed budget
  if (requestedAmount !== undefined) {
    if (currentAmount + requestedAmount > mandate.max_amount) {
      const remaining = mandate.max_amount - currentAmount;
      return {
        allowed: false,
        reason: `Requested amount would exceed budget (${requestedAmount} > ${remaining} ${mandate.currency} remaining)`,
        remaining: { amount: remaining },
      };
    }
  }

  // Check budget window if specified
  if (mandate.window !== undefined && state?.first_use !== undefined) {
    const currentTime = Math.floor(Date.now() / 1000);
    const windowExpiry = state.first_use + mandate.window;

    if (currentTime > windowExpiry) {
      return {
        allowed: false,
        reason: 'Budget window expired',
        remaining: { amount: 0 },
      };
    }
  }

  const remainingAmount = mandate.max_amount - currentAmount;

  return {
    allowed: true,
    remaining: { amount: remainingAmount },
  };
}

/**
 * Enforce combined mandate
 */
export function enforceCombinedConstraint(
  mandate: CombinedConstraint,
  state?: ControlState,
  requestedAmount?: number,
  currentTime?: number
): EnforcementResult {
  const results: EnforcementResult[] = [];

  // Check temporal constraints
  if (mandate.temporal !== undefined) {
    const temporalConstraint: TemporalConstraint = {
      type: 'temporal',
      ...mandate.temporal,
    };
    const result = enforceTemporalConstraint(temporalConstraint, currentTime);
    results.push(result);
  }

  // Check usage constraints
  if (mandate.usage !== undefined) {
    const usageConstraint: UsageConstraint = {
      type: 'usage',
      ...mandate.usage,
    };
    const result = enforceUsageConstraint(usageConstraint, state);
    results.push(result);
  }

  // Check budget constraints
  if (mandate.budget !== undefined) {
    const budgetConstraint: BudgetConstraint = {
      type: 'budget',
      ...mandate.budget,
    };
    const result = enforceBudgetConstraint(budgetConstraint, state, requestedAmount);
    results.push(result);
  }

  // All constraints must be satisfied
  const failedResult = results.find((r) => !r.allowed);
  if (failedResult) {
    return failedResult;
  }

  // Merge remaining information
  const remaining: EnforcementResult['remaining'] = {};
  for (const result of results) {
    if (result.remaining) {
      Object.assign(remaining, result.remaining);
    }
  }

  return {
    allowed: true,
    remaining: Object.keys(remaining).length > 0 ? remaining : undefined,
  };
}

/**
 * Enforce mandate (dispatcher)
 */
export function enforceConstraint(
  mandate: Constraint,
  state?: ControlState,
  requestedAmount?: number,
  currentTime?: number
): EnforcementResult {
  switch (mandate.type) {
    case 'temporal':
      return enforceTemporalConstraint(mandate, currentTime);

    case 'usage':
      return enforceUsageConstraint(mandate, state);

    case 'budget':
      return enforceBudgetConstraint(mandate, state, requestedAmount);

    case 'combined':
      return enforceCombinedConstraint(mandate, state, requestedAmount, currentTime);

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = mandate;
      return {
        allowed: false,
        reason: `Unknown mandate type: ${(_exhaustive as any).type}`,
      };
    }
  }
}

/**
 * Enforce control block
 *
 * @deprecated Use enforceConstraint directly. This function is maintained for backward compatibility.
 */
export function enforceControlBlock(
  constraint: Constraint,
  state?: ControlState,
  requestedAmount?: number,
  currentTime?: number
): EnforcementResult {
  return enforceConstraint(constraint, state, requestedAmount, currentTime);
}
