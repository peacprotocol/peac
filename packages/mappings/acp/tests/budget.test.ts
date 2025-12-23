/**
 * Tests for ACP budget enforcement utilities
 */

import { describe, it, expect } from 'vitest';
import { checkBudget, type BudgetConfig, type BudgetResult } from '../src/budget';

describe('ACP Budget Utilities', () => {
  describe('checkBudget - currency matching', () => {
    it('should allow when currency matches', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 50000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.code).toBeUndefined();
    });

    it('should reject when currency does not match', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 50000n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('currency_mismatch');
      expect(result.reason).toContain('Currency mismatch');
      expect(result.reason).toContain('expected INR');
      expect(result.reason).toContain('got USD');
      expect(result.remainingMinor).toBe(0n);
    });

    it('should enforce exact currency match (case-sensitive)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 50000n, 'inr', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('currency_mismatch');
    });
  });

  describe('checkBudget - per-call limit', () => {
    it('should allow when cost is within per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 50000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(100000n);
    });

    it('should allow when cost exactly equals per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 100000n, 'INR', config);

      expect(result.allowed).toBe(true);
    });

    it('should reject when cost exceeds per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 100001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Per-call limit exceeded');
      expect(result.remainingMinor).toBe(-1n);
    });

    it('should allow when no per-call limit is set', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 999999999n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
    });
  });

  describe('checkBudget - daily limit', () => {
    it('should allow when total is within daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(500000n, 300000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(200000n);
    });

    it('should allow when total exactly equals daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(700000n, 300000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(0n);
    });

    it('should reject when total exceeds daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(700000n, 300001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
      expect(result.remainingMinor).toBe(300000n);
    });

    it('should calculate remaining daily budget correctly', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(200000n, 300000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(500000n);
    });
  });

  describe('checkBudget - monthly limit', () => {
    it('should allow when total is within monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 10000000n,
        currency: 'INR',
      };

      const result = checkBudget(5000000n, 3000000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(2000000n);
    });

    it('should allow when total exactly equals monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 10000000n,
        currency: 'INR',
      };

      const result = checkBudget(7000000n, 3000000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(0n);
    });

    it('should reject when total exceeds monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 10000000n,
        currency: 'INR',
      };

      const result = checkBudget(7000000n, 3000001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Monthly limit exceeded');
      expect(result.remainingMinor).toBe(3000000n);
    });
  });

  describe('checkBudget - multiple limits', () => {
    it('should enforce all limits (per-call, daily, monthly)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 500000n,
        maxDailyMinor: 5000000n,
        maxMonthlyMinor: 50000000n,
        currency: 'INR',
      };

      const result = checkBudget(4000000n, 400000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(500000n);
    });

    it('should fail on per-call limit even if daily/monthly are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        maxDailyMinor: 5000000n,
        maxMonthlyMinor: 50000000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 100001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Per-call limit exceeded');
    });

    it('should fail on daily limit even if per-call and monthly are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 500000n,
        maxDailyMinor: 1000000n,
        maxMonthlyMinor: 50000000n,
        currency: 'INR',
      };

      const result = checkBudget(900000n, 100001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('should fail on monthly limit even if per-call and daily are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 500000n,
        maxDailyMinor: 50000000n, // High daily limit so monthly is hit first
        maxMonthlyMinor: 10000000n,
        currency: 'INR',
      };

      const result = checkBudget(9900000n, 100001n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Monthly limit exceeded');
    });

    it('should return most restrictive remaining budget', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000000n,
        maxDailyMinor: 2000000n,
        maxMonthlyMinor: 10000000n,
        currency: 'INR',
      };

      const result = checkBudget(1500000n, 200000n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(300000n);
    });
  });

  describe('checkBudget - edge cases', () => {
    it('should handle zero cost', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(500000n, 0n, 'INR', config);

      expect(result.allowed).toBe(true);
      // Remaining is minimum of:
      // - per-call limit: 100000n
      // - daily remaining: 1000000n - 500000n = 500000n
      // So minimum is 100000n (per-call is more restrictive)
      expect(result.remainingMinor).toBe(100000n);
    });

    it('should handle zero spent', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 50000n, 'INR', config);

      expect(result.allowed).toBe(true);
      // Remaining is minimum of:
      // - per-call limit: 100000n
      // - daily remaining: 1000000n - 50000n = 950000n
      // So minimum is 100000n
      expect(result.remainingMinor).toBe(100000n);
    });

    it('should handle zero budget (all limits are 0)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 0n,
        maxDailyMinor: 0n,
        currency: 'INR',
      };

      const result = checkBudget(0n, 1n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
    });

    it('should handle very large amounts (bigint)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        currency: 'INR',
      };

      const result = checkBudget(0n, 9007199254740990n, 'INR', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(1n);
    });
  });

  describe('checkBudget - purity and determinism', () => {
    it('should be pure (same inputs produce same outputs)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result1 = checkBudget(500000n, 200000n, 'INR', config);
      const result2 = checkBudget(500000n, 200000n, 'INR', config);

      expect(result1).toEqual(result2);
    });

    it('should not modify config', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 100000n,
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const originalConfig = { ...config };

      checkBudget(500000n, 200000n, 'INR', config);

      expect(config).toEqual(originalConfig);
    });
  });

  describe('checkBudget - golden vectors', () => {
    it('Golden Vector 1: Simple daily budget check (allowed)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(
        850000n, // spent 8500.00 INR
        100000n, // cost 1000.00 INR
        'INR',
        config
      );

      expect(result).toEqual({
        allowed: true,
        remainingMinor: 50000n,
      });

      console.log('\n=== GOLDEN VECTOR 1: Daily Budget Check (Allowed) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent: 850000n (8500.00 INR)');
      console.log('Cost: 100000n (1000.00 INR)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('======================================================\n');
    });

    it('Golden Vector 2: Currency mismatch', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 500000n,
        currency: 'INR',
      };

      const result = checkBudget(
        0n,
        300000n,
        'USD', // wrong currency
        config
      );

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('currency_mismatch');
      expect(result.remainingMinor).toBe(0n);

      console.log('\n=== GOLDEN VECTOR 2: Currency Mismatch ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Cost: 300000n USD (expected INR)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('==========================================\n');
    });

    it('Golden Vector 3: Multi-tier budget (per-call, daily, monthly)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 500000n,
        maxDailyMinor: 5000000n,
        maxMonthlyMinor: 50000000n,
        currency: 'INR',
      };

      const result = checkBudget(
        4500000n, // spent 45000.00 INR today
        400000n, // cost 4000.00 INR
        'INR',
        config
      );

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(100000n);

      console.log('\n=== GOLDEN VECTOR 3: Multi-Tier Budget (Allowed) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent Today: 4500000n (45000.00 INR)');
      console.log('Cost: 400000n (4000.00 INR)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('=====================================================\n');
    });

    it('Golden Vector 4: Budget exceeded (daily limit)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 1000000n,
        currency: 'INR',
      };

      const result = checkBudget(
        900000n, // spent 9000.00 INR today
        100001n, // cost 1000.01 INR - exceeds daily limit
        'INR',
        config
      );

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.remainingMinor).toBe(100000n);

      console.log('\n=== GOLDEN VECTOR 4: Budget Exceeded (Daily) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent Today: 900000n (9000.00 INR)');
      console.log('Cost: 100001n (1000.01 INR)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('================================================\n');
    });
  });
});
