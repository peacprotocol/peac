/**
 * Control Abstraction Layer - Enforcement Tests
 */

import { describe, it, expect } from 'vitest';
import {
  enforceTemporalConstraint as enforceTemporalMandate,
  enforceUsageConstraint as enforceUsageMandate,
  enforceBudgetConstraint as enforceBudgetMandate,
  enforceCombinedConstraint as enforceCombinedMandate,
  enforceConstraint as enforceMandate,
} from '../src/enforcement';
import type { TemporalMandate, UsageMandate, BudgetMandate, CombinedMandate } from '../src/types';

describe('enforceTemporalMandate', () => {
  it('should allow access within valid time range', () => {
    const now = Math.floor(Date.now() / 1000);
    const mandate: TemporalMandate = {
      type: 'temporal',
      valid_from: now - 3600, // 1 hour ago
      valid_until: now + 3600, // 1 hour from now
    };

    const result = enforceTemporalMandate(mandate, now);
    expect(result.allowed).toBe(true);
    expect(result.remaining?.seconds).toBeGreaterThan(0);
  });

  it('should deny access before valid_from', () => {
    const now = Math.floor(Date.now() / 1000);
    const mandate: TemporalMandate = {
      type: 'temporal',
      valid_from: now + 3600, // 1 hour from now
    };

    const result = enforceTemporalMandate(mandate, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not yet valid');
  });

  it('should deny access after valid_until', () => {
    const now = Math.floor(Date.now() / 1000);
    const mandate: TemporalMandate = {
      type: 'temporal',
      valid_until: now - 3600, // 1 hour ago
    };

    const result = enforceTemporalMandate(mandate, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('expired');
  });
});

describe('enforceUsageMandate', () => {
  it('should allow access within usage limit', () => {
    const mandate: UsageMandate = {
      type: 'usage',
      max_uses: 10,
      current_uses: 5,
    };

    const result = enforceUsageMandate(mandate);
    expect(result.allowed).toBe(true);
    expect(result.remaining?.uses).toBe(5);
  });

  it('should deny access when usage limit exceeded', () => {
    const mandate: UsageMandate = {
      type: 'usage',
      max_uses: 10,
      current_uses: 10,
    };

    const result = enforceUsageMandate(mandate);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeded');
  });

  it('should track usage from state', () => {
    const mandate: UsageMandate = {
      type: 'usage',
      max_uses: 5,
    };

    const state = {
      receipt_id: '123e4567-e89b-12d3-a456-426614174000',
      constraint: mandate,
      usage_count: 3,
    };

    const result = enforceUsageMandate(mandate, state);
    expect(result.allowed).toBe(true);
    expect(result.remaining?.uses).toBe(2);
  });
});

describe('enforceBudgetMandate', () => {
  it('should allow access within budget', () => {
    const mandate: BudgetMandate = {
      type: 'budget',
      max_amount: 10000,
      current_amount: 5000,
      currency: 'USD',
    };

    const result = enforceBudgetMandate(mandate);
    expect(result.allowed).toBe(true);
    expect(result.remaining?.amount).toBe(5000);
  });

  it('should deny access when budget exceeded', () => {
    const mandate: BudgetMandate = {
      type: 'budget',
      max_amount: 10000,
      current_amount: 10000,
      currency: 'USD',
    };

    const result = enforceBudgetMandate(mandate);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeded');
  });

  it('should deny when requested amount would exceed budget', () => {
    const mandate: BudgetMandate = {
      type: 'budget',
      max_amount: 10000,
      current_amount: 9000,
      currency: 'USD',
    };

    const result = enforceBudgetMandate(mandate, undefined, 2000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('would exceed budget');
  });
});

describe('enforceCombinedMandate', () => {
  it('should allow when all constraints satisfied', () => {
    const now = Math.floor(Date.now() / 1000);
    const mandate: CombinedMandate = {
      type: 'combined',
      temporal: {
        valid_from: now - 3600,
        valid_until: now + 3600,
      },
      usage: {
        max_uses: 10,
        current_uses: 5,
      },
      budget: {
        max_amount: 10000,
        current_amount: 5000,
        currency: 'USD',
      },
    };

    const result = enforceCombinedMandate(mandate, undefined, undefined, now);
    expect(result.allowed).toBe(true);
    expect(result.remaining?.uses).toBe(5);
    expect(result.remaining?.amount).toBe(5000);
  });

  it('should deny when any constraint fails', () => {
    const now = Math.floor(Date.now() / 1000);
    const mandate: CombinedMandate = {
      type: 'combined',
      temporal: {
        valid_until: now - 3600, // Expired
      },
      usage: {
        max_uses: 10,
        current_uses: 5,
      },
    };

    const result = enforceCombinedMandate(mandate, undefined, undefined, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('expired');
  });
});

describe('enforceMandate', () => {
  it('should dispatch to correct enforcement function', () => {
    const now = Math.floor(Date.now() / 1000);
    const temporalMandate: TemporalMandate = {
      type: 'temporal',
      valid_from: now - 3600,
      valid_until: now + 3600,
    };

    const result = enforceMandate(temporalMandate, undefined, undefined, now);
    expect(result.allowed).toBe(true);
  });
});
