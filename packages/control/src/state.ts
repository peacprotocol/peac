/**
 * PEAC Control Abstraction Layer (CAL) State Management
 *
 * State tracking and updates for control blocks.
 */

import type { ControlState, Constraint } from './types';

/**
 * Create initial control state
 */
export function createControlState(
  receiptId: string,
  constraint: Constraint
): ControlState {
  return {
    receipt_id: receiptId,
    constraint,
    usage_count: 0,
    spent_amount: 0,
    metadata: {},
  };
}

/**
 * Update state after usage
 */
export function updateStateAfterUse(
  state: ControlState,
  amount?: number
): ControlState {
  const currentTime = Math.floor(Date.now() / 1000);
  const usageCount = (state.usage_count ?? 0) + 1;
  const spentAmount = (state.spent_amount ?? 0) + (amount ?? 0);

  return {
    ...state,
    usage_count: usageCount,
    spent_amount: spentAmount,
    first_use: state.first_use ?? currentTime,
    last_use: currentTime,
  };
}

/**
 * Check if state is expired
 */
export function isStateExpired(state: ControlState): boolean {
  const { constraint: mandate } = state;
  const currentTime = Math.floor(Date.now() / 1000);

  // Check temporal expiry
  if (mandate.type === 'temporal') {
    if (mandate.valid_until !== undefined && currentTime > mandate.valid_until) {
      return true;
    }
    if (mandate.duration !== undefined && state.first_use !== undefined) {
      const expiresAt = state.first_use + mandate.duration;
      if (currentTime > expiresAt) {
        return true;
      }
    }
  }

  // Check combined mandate temporal expiry
  if (mandate.type === 'combined' && mandate.temporal) {
    if (mandate.temporal.valid_until !== undefined && currentTime > mandate.temporal.valid_until) {
      return true;
    }
    if (mandate.temporal.duration !== undefined && state.first_use !== undefined) {
      const expiresAt = state.first_use + mandate.temporal.duration;
      if (currentTime > expiresAt) {
        return true;
      }
    }
  }

  // Check window expiry for usage mandates
  if (mandate.type === 'usage' && mandate.window !== undefined && state.first_use !== undefined) {
    const windowExpiry = state.first_use + mandate.window;
    if (currentTime > windowExpiry) {
      return true;
    }
  }

  // Check window expiry for budget mandates
  if (mandate.type === 'budget' && mandate.window !== undefined && state.first_use !== undefined) {
    const windowExpiry = state.first_use + mandate.window;
    if (currentTime > windowExpiry) {
      return true;
    }
  }

  // Check window expiry for combined mandates
  if (mandate.type === 'combined') {
    if (mandate.usage?.window !== undefined && state.first_use !== undefined) {
      const windowExpiry = state.first_use + mandate.usage.window;
      if (currentTime > windowExpiry) {
        return true;
      }
    }
    if (mandate.budget?.window !== undefined && state.first_use !== undefined) {
      const windowExpiry = state.first_use + mandate.budget.window;
      if (currentTime > windowExpiry) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Reset state (for windowed mandates)
 */
export function resetState(state: ControlState): ControlState {
  return {
    ...state,
    usage_count: 0,
    spent_amount: 0,
    first_use: undefined,
    last_use: undefined,
  };
}

/**
 * Get state summary for debugging
 */
export function getStateSummary(state: ControlState): string {
  const parts: string[] = [];

  if (state.usage_count !== undefined && state.usage_count > 0) {
    parts.push(`uses: ${state.usage_count}`);
  }

  if (state.spent_amount !== undefined && state.spent_amount > 0) {
    const currency = state.constraint.type === 'budget'
      ? state.constraint.currency
      : state.constraint.type === 'combined' && state.constraint.budget
        ? state.constraint.budget.currency
        : 'units';
    parts.push(`spent: ${state.spent_amount} ${currency}`);
  }

  if (state.first_use !== undefined) {
    const date = new Date(state.first_use * 1000).toISOString();
    parts.push(`first: ${date}`);
  }

  if (state.last_use !== undefined) {
    const date = new Date(state.last_use * 1000).toISOString();
    parts.push(`last: ${date}`);
  }

  return parts.join(', ');
}
