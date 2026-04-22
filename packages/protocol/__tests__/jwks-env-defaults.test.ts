/**
 * JWKS resolver env-var defaults (v0.12.14).
 *
 * Locks the contract documented in
 * docs/privacy/RETENTION-AND-DELETION.md §5:
 *
 *   - `PEAC_JWKS_CACHE_TTL_MS` and `PEAC_JWKS_CACHE_MAX_ENTRIES`
 *     parse as positive integers and override the built-in defaults.
 *   - Malformed values (non-numeric, non-positive, NaN, infinite,
 *     empty string, missing) fall back to the built-in defaults.
 *   - The built-in defaults remain `300000` ms (5 minutes) and
 *     `1000` entries when neither env var nor caller option is
 *     supplied.
 *
 * The pure-function `__parseEnvPositiveInt` is the testable form of
 * the rule; tests pass a synthetic env object so they do not mutate
 * process.env or rely on test ordering.
 */

import { describe, it, expect } from 'vitest';
import { __parseEnvPositiveInt, __getJwksCacheDefaults } from '../src/jwks-resolver.js';

describe('JWKS env-var defaults (v0.12.14)', () => {
  describe('__parseEnvPositiveInt', () => {
    it('returns the fallback when the env var is unset', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, {})).toBe(42);
    });

    it('returns the fallback when the env var is the empty string', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '' })).toBe(42);
    });

    it('returns the parsed value when the env var is a positive integer', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '60000' })).toBe(60000);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '1' })).toBe(1);
    });

    it('returns the fallback for non-numeric strings', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: 'not-a-number' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: 'abc' })).toBe(42);
    });

    it('returns the fallback for zero or negative values', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '0' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '-1' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '-1000' })).toBe(42);
    });

    it('returns the fallback for non-integer numeric strings', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '3.14' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '0.5' })).toBe(42);
    });

    it('returns the fallback for scientific notation strings', () => {
      // Decimal-only rule: only /^[1-9][0-9]*$/ passes.
      // Scientific notation is an operator error and falls back to the built-in.
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '1e3' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: '1e10' })).toBe(42);
    });

    it('returns the fallback for Infinity / NaN', () => {
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: 'Infinity' })).toBe(42);
      expect(__parseEnvPositiveInt('PEAC_X', 42, { PEAC_X: 'NaN' })).toBe(42);
    });
  });

  describe('__getJwksCacheDefaults', () => {
    it('returns positive integers for both ttlMs and maxEntries', () => {
      const d = __getJwksCacheDefaults();
      expect(Number.isInteger(d.ttlMs)).toBe(true);
      expect(d.ttlMs).toBeGreaterThan(0);
      expect(Number.isInteger(d.maxEntries)).toBe(true);
      expect(d.maxEntries).toBeGreaterThan(0);
    });

    it('falls back to the built-in defaults when env vars are unset', () => {
      // The defaults are read once at module load; we cannot mutate
      // process.env after the fact and observe a change. We can,
      // however, assert that when no env override is in scope (the
      // CI default), the values are exactly the built-ins documented
      // in docs/privacy/RETENTION-AND-DELETION.md §5.
      const env = process.env as Record<string, string | undefined>;
      const ttlEnvSet = env.PEAC_JWKS_CACHE_TTL_MS && env.PEAC_JWKS_CACHE_TTL_MS.length > 0;
      const maxEnvSet =
        env.PEAC_JWKS_CACHE_MAX_ENTRIES && env.PEAC_JWKS_CACHE_MAX_ENTRIES.length > 0;
      const d = __getJwksCacheDefaults();
      if (!ttlEnvSet) expect(d.ttlMs).toBe(5 * 60 * 1000);
      if (!maxEnvSet) expect(d.maxEntries).toBe(1000);
    });
  });
});
