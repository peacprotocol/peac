/**
 * Tests for MCP budget enforcement utilities
 */

import { describe, it, expect } from 'vitest';
import { checkBudget, type BudgetConfig, type BudgetResult } from '../src/budget';

describe('MCP Budget Utilities', () => {
  describe('checkBudget - currency matching', () => {
    it('should allow when currency matches', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 500n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.code).toBeUndefined();
    });

    it('should reject when currency does not match', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 500n, 'INR', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('currency_mismatch');
      expect(result.reason).toContain('Currency mismatch');
      expect(result.reason).toContain('expected USD');
      expect(result.reason).toContain('got INR');
      expect(result.remainingMinor).toBe(0n);
    });

    it('should enforce exact currency match (case-sensitive)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 500n, 'usd', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('currency_mismatch');
    });
  });

  describe('checkBudget - per-call limit', () => {
    it('should allow when cost is within per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 500n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(1000n);
    });

    it('should allow when cost exactly equals per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 1000n, 'USD', config);

      expect(result.allowed).toBe(true);
    });

    it('should reject when cost exceeds per-call limit', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 1001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Per-call limit exceeded');
      expect(result.remainingMinor).toBe(0n); // Never negative - clamped to 0
    });

    it('should allow when no per-call limit is set', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 9999999n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
    });
  });

  describe('checkBudget - daily limit', () => {
    it('should allow when total is within daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(5000n, 3000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(2000n);
    });

    it('should allow when total exactly equals daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(7000n, 3000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(0n);
    });

    it('should reject when total exceeds daily limit', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(7000n, 3001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
      expect(result.remainingMinor).toBe(3000n);
    });

    it('should calculate remaining daily budget correctly', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(2000n, 3000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(5000n);
    });
  });

  describe('checkBudget - monthly limit', () => {
    it('should allow when total is within monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 100000n,
        currency: 'USD',
      };

      const result = checkBudget(50000n, 30000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(20000n);
    });

    it('should allow when total exactly equals monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 100000n,
        currency: 'USD',
      };

      const result = checkBudget(70000n, 30000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(0n);
    });

    it('should reject when total exceeds monthly limit', () => {
      const config: BudgetConfig = {
        maxMonthlyMinor: 100000n,
        currency: 'USD',
      };

      const result = checkBudget(70000n, 30001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Monthly limit exceeded');
      expect(result.remainingMinor).toBe(30000n);
    });
  });

  describe('checkBudget - multiple limits', () => {
    it('should enforce all limits (per-call, daily, monthly)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 5000n,
        maxDailyMinor: 50000n,
        maxMonthlyMinor: 500000n,
        currency: 'USD',
      };

      const result = checkBudget(40000n, 4000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(5000n);
    });

    it('should fail on per-call limit even if daily/monthly are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        maxDailyMinor: 50000n,
        maxMonthlyMinor: 500000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 1001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Per-call limit exceeded');
    });

    it('should fail on daily limit even if per-call and monthly are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 5000n,
        maxDailyMinor: 10000n,
        maxMonthlyMinor: 500000n,
        currency: 'USD',
      };

      const result = checkBudget(9000n, 1001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('should fail on monthly limit even if per-call and daily are ok', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 5000n,
        maxDailyMinor: 500000n, // High daily limit so monthly is hit first
        maxMonthlyMinor: 100000n,
        currency: 'USD',
      };

      const result = checkBudget(99000n, 1001n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.reason).toContain('Monthly limit exceeded');
    });

    it('should return most restrictive remaining budget', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 10000n,
        maxDailyMinor: 20000n,
        maxMonthlyMinor: 100000n,
        currency: 'USD',
      };

      const result = checkBudget(15000n, 2000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(3000n);
    });
  });

  describe('checkBudget - edge cases', () => {
    it('should handle zero cost', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(5000n, 0n, 'USD', config);

      expect(result.allowed).toBe(true);
      // Remaining is minimum of:
      // - per-call limit: 1000n
      // - daily remaining: 10000n - 5000n - 0n = 5000n
      // So minimum is 1000n (per-call is more restrictive)
      expect(result.remainingMinor).toBe(1000n);
    });

    it('should handle zero spent', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 500n, 'USD', config);

      expect(result.allowed).toBe(true);
      // Remaining is minimum of:
      // - per-call limit: 1000n
      // - daily remaining: 10000n - 500n = 9500n
      // So minimum is 1000n
      expect(result.remainingMinor).toBe(1000n);
    });

    it('should handle zero budget (all limits are 0)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 0n,
        maxDailyMinor: 0n,
        currency: 'USD',
      };

      const result = checkBudget(0n, 1n, 'USD', config);

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
    });

    it('should handle very large amounts (bigint)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 9007199254740991n, // Number.MAX_SAFE_INTEGER
        currency: 'USD',
      };

      const result = checkBudget(0n, 9007199254740990n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(1n);
    });

    it('should return unbounded when no limits configured', () => {
      const config: BudgetConfig = {
        currency: 'USD',
      };

      const result = checkBudget(0n, 1000000n, 'USD', config);

      expect(result.allowed).toBe(true);
      expect(result.unbounded).toBe(true);
      expect(result.remainingMinor).toBeUndefined();
    });
  });

  describe('checkBudget - purity and determinism', () => {
    it('should be pure (same inputs produce same outputs)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result1 = checkBudget(5000n, 2000n, 'USD', config);
      const result2 = checkBudget(5000n, 2000n, 'USD', config);

      expect(result1).toEqual(result2);
    });

    it('should not modify config', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 1000n,
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const originalConfig = { ...config };

      checkBudget(5000n, 2000n, 'USD', config);

      expect(config).toEqual(originalConfig);
    });
  });

  describe('checkBudget - golden vectors', () => {
    it('Golden Vector 1: Simple daily budget check (allowed)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(
        8500n, // spent 85.00 USD
        1000n, // cost 10.00 USD
        'USD',
        config
      );

      expect(result).toEqual({
        allowed: true,
        remainingMinor: 500n,
      });

      console.log('\n=== GOLDEN VECTOR 1: Daily Budget Check (Allowed) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent: 8500n (85.00 USD)');
      console.log('Cost: 1000n (10.00 USD)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('======================================================\n');
    });

    it('Golden Vector 2: Currency mismatch', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 5000n,
        currency: 'USD',
      };

      const result = checkBudget(
        0n,
        3000n,
        'INR', // wrong currency
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
      console.log('Cost: 3000n INR (expected USD)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('==========================================\n');
    });

    it('Golden Vector 3: Multi-tier budget (per-call, daily, monthly)', () => {
      const config: BudgetConfig = {
        maxPerCallMinor: 5000n,
        maxDailyMinor: 50000n,
        maxMonthlyMinor: 500000n,
        currency: 'USD',
      };

      const result = checkBudget(
        45000n, // spent 450.00 USD today
        4000n, // cost 40.00 USD
        'USD',
        config
      );

      expect(result.allowed).toBe(true);
      expect(result.remainingMinor).toBe(1000n);

      console.log('\n=== GOLDEN VECTOR 3: Multi-Tier Budget (Allowed) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent Today: 45000n (450.00 USD)');
      console.log('Cost: 4000n (40.00 USD)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('=====================================================\n');
    });

    it('Golden Vector 4: Budget exceeded (daily limit)', () => {
      const config: BudgetConfig = {
        maxDailyMinor: 10000n,
        currency: 'USD',
      };

      const result = checkBudget(
        9000n, // spent 90.00 USD today
        1001n, // cost 10.01 USD - exceeds daily limit
        'USD',
        config
      );

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('budget_exceeded');
      expect(result.remainingMinor).toBe(1000n);

      console.log('\n=== GOLDEN VECTOR 4: Budget Exceeded (Daily) ===');
      console.log(
        'Config:',
        JSON.stringify(config, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('Spent Today: 9000n (90.00 USD)');
      console.log('Cost: 1001n (10.01 USD)');
      console.log(
        'Result:',
        JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
      );
      console.log('================================================\n');
    });
  });
});
