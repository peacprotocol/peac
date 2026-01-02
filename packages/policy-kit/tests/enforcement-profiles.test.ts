/**
 * Enforcement Profiles Tests (v0.9.24+)
 */

import { describe, it, expect } from 'vitest';
import {
  // Profile definitions
  STRICT_PROFILE,
  BALANCED_PROFILE,
  OPEN_PROFILE,
  ENFORCEMENT_PROFILES,
  ENFORCEMENT_PROFILE_IDS,
  DEFAULT_ENFORCEMENT_PROFILE,
  // Profile lookup
  getEnforcementProfile,
  isEnforcementProfileId,
  getDefaultEnforcementProfile,
  // Purpose evaluation
  evaluatePurpose,
  getPurposeStatusCode,
  getRetryAfter,
  // Types
  type PolicyConstraints,
} from '../src';

describe('Enforcement Profiles (v0.9.24+)', () => {
  describe('Profile Definitions', () => {
    it('should have three canonical profiles', () => {
      expect(ENFORCEMENT_PROFILE_IDS).toEqual(['strict', 'balanced', 'open']);
      expect(Object.keys(ENFORCEMENT_PROFILES)).toHaveLength(3);
    });

    it('should have balanced as default', () => {
      expect(DEFAULT_ENFORCEMENT_PROFILE).toBe('balanced');
    });

    describe('strict profile', () => {
      it('should deny undeclared purposes', () => {
        expect(STRICT_PROFILE.id).toBe('strict');
        expect(STRICT_PROFILE.undeclared_decision).toBe('deny');
        expect(STRICT_PROFILE.unknown_decision).toBe('deny');
        expect(STRICT_PROFILE.receipts).toBe('required');
      });

      it('should not have default constraints', () => {
        expect(STRICT_PROFILE.default_constraints).toBeUndefined();
      });
    });

    describe('balanced profile', () => {
      it('should review undeclared purposes', () => {
        expect(BALANCED_PROFILE.id).toBe('balanced');
        expect(BALANCED_PROFILE.undeclared_decision).toBe('review');
        expect(BALANCED_PROFILE.unknown_decision).toBe('review');
        expect(BALANCED_PROFILE.receipts).toBe('optional');
      });

      it('should have default rate limit constraints', () => {
        expect(BALANCED_PROFILE.default_constraints).toBeDefined();
        expect(BALANCED_PROFILE.default_constraints?.rate_limit).toEqual({
          window_s: 3600,
          max: 100,
          retry_after_s: 60,
        });
      });
    });

    describe('open profile', () => {
      it('should allow undeclared purposes', () => {
        expect(OPEN_PROFILE.id).toBe('open');
        expect(OPEN_PROFILE.undeclared_decision).toBe('allow');
        expect(OPEN_PROFILE.unknown_decision).toBe('allow');
        expect(OPEN_PROFILE.receipts).toBe('optional');
      });

      it('should not have default constraints', () => {
        expect(OPEN_PROFILE.default_constraints).toBeUndefined();
      });
    });
  });

  describe('Profile Lookup', () => {
    describe('getEnforcementProfile', () => {
      it('should return strict profile', () => {
        const profile = getEnforcementProfile('strict');
        expect(profile).toBe(STRICT_PROFILE);
      });

      it('should return balanced profile', () => {
        const profile = getEnforcementProfile('balanced');
        expect(profile).toBe(BALANCED_PROFILE);
      });

      it('should return open profile', () => {
        const profile = getEnforcementProfile('open');
        expect(profile).toBe(OPEN_PROFILE);
      });

      it('should throw for invalid profile ID', () => {
        expect(() => getEnforcementProfile('invalid' as never)).toThrow(
          'Invalid enforcement profile ID: invalid'
        );
      });
    });

    describe('isEnforcementProfileId', () => {
      it('should return true for valid IDs', () => {
        expect(isEnforcementProfileId('strict')).toBe(true);
        expect(isEnforcementProfileId('balanced')).toBe(true);
        expect(isEnforcementProfileId('open')).toBe(true);
      });

      it('should return false for invalid IDs', () => {
        expect(isEnforcementProfileId('invalid')).toBe(false);
        expect(isEnforcementProfileId('')).toBe(false);
        expect(isEnforcementProfileId('STRICT')).toBe(false);
      });
    });

    describe('getDefaultEnforcementProfile', () => {
      it('should return balanced profile', () => {
        const profile = getDefaultEnforcementProfile();
        expect(profile).toBe(BALANCED_PROFILE);
        expect(profile.id).toBe('balanced');
      });
    });
  });

  describe('Purpose Evaluation', () => {
    describe('with no declared purposes (undeclared)', () => {
      it('strict: should deny', () => {
        const result = evaluatePurpose([], 'strict');
        expect(result.decision).toBe('deny');
        expect(result.purpose_reason).toBe('undeclared_default');
        expect(result.purpose_declared).toBe(false);
        expect(result.has_unknown_tokens).toBe(false);
        expect(result.profile_id).toBe('strict');
      });

      it('balanced: should review with constraints', () => {
        const result = evaluatePurpose([], 'balanced');
        expect(result.decision).toBe('review');
        expect(result.purpose_reason).toBe('undeclared_default');
        expect(result.purpose_declared).toBe(false);
        expect(result.constraints).toBeDefined();
        expect(result.constraints?.rate_limit?.max).toBe(100);
        expect(result.profile_id).toBe('balanced');
      });

      it('open: should allow', () => {
        const result = evaluatePurpose([], 'open');
        expect(result.decision).toBe('allow');
        expect(result.purpose_reason).toBe('undeclared_default');
        expect(result.purpose_declared).toBe(false);
        expect(result.profile_id).toBe('open');
      });

      it('should use balanced as default profile', () => {
        const result = evaluatePurpose([]);
        expect(result.decision).toBe('review');
        expect(result.profile_id).toBe('balanced');
      });
    });

    describe('with canonical purposes', () => {
      const canonicalPurposes = ['train', 'search', 'user_action', 'inference', 'index'];

      for (const purpose of canonicalPurposes) {
        it(`should allow ${purpose}`, () => {
          const result = evaluatePurpose([purpose], 'balanced');
          expect(result.decision).toBe('allow');
          expect(result.purpose_enforced).toBe(purpose);
          expect(result.purpose_declared).toBe(true);
          expect(result.has_unknown_tokens).toBe(false);
        });
      }

      it('should use first canonical purpose as enforced', () => {
        const result = evaluatePurpose(['train', 'search', 'inference'], 'balanced');
        expect(result.decision).toBe('allow');
        expect(result.purpose_enforced).toBe('train');
      });
    });

    describe('with legacy purposes', () => {
      it('should map crawl to index', () => {
        const result = evaluatePurpose(['crawl'], 'balanced');
        expect(result.decision).toBe('allow');
        expect(result.purpose_enforced).toBe('index');
      });

      it('should map ai_input to inference', () => {
        const result = evaluatePurpose(['ai_input'], 'balanced');
        expect(result.decision).toBe('allow');
        expect(result.purpose_enforced).toBe('inference');
      });

      it('should map ai_index to index', () => {
        const result = evaluatePurpose(['ai_index'], 'balanced');
        expect(result.decision).toBe('allow');
        expect(result.purpose_enforced).toBe('index');
      });
    });

    describe('with unknown purpose tokens', () => {
      it('strict: should deny unknown-only tokens', () => {
        const result = evaluatePurpose(['vendor:custom'], 'strict');
        expect(result.decision).toBe('deny');
        expect(result.purpose_reason).toBe('unknown_preserved');
        expect(result.has_unknown_tokens).toBe(true);
        expect(result.unknown_tokens).toEqual(['vendor:custom']);
      });

      it('balanced: should review unknown-only tokens', () => {
        const result = evaluatePurpose(['acme:special'], 'balanced');
        expect(result.decision).toBe('review');
        expect(result.purpose_reason).toBe('unknown_preserved');
        expect(result.has_unknown_tokens).toBe(true);
        expect(result.unknown_tokens).toEqual(['acme:special']);
        expect(result.constraints).toBeDefined();
      });

      it('open: should allow unknown-only tokens', () => {
        const result = evaluatePurpose(['vendor:custom'], 'open');
        expect(result.decision).toBe('allow');
        expect(result.purpose_reason).toBe('unknown_preserved');
        expect(result.has_unknown_tokens).toBe(true);
      });

      it('should allow when mix of canonical and unknown', () => {
        const result = evaluatePurpose(['train', 'vendor:custom'], 'strict');
        expect(result.decision).toBe('allow');
        expect(result.purpose_enforced).toBe('train');
        expect(result.purpose_reason).toBe('unknown_preserved');
        expect(result.has_unknown_tokens).toBe(true);
        expect(result.unknown_tokens).toEqual(['vendor:custom']);
      });

      it('should preserve multiple unknown tokens', () => {
        const result = evaluatePurpose(['vendor:a', 'vendor:b', 'other:x'], 'balanced');
        expect(result.unknown_tokens).toEqual(['vendor:a', 'vendor:b', 'other:x']);
      });
    });

    describe('with vendor-prefixed tokens', () => {
      it('should treat cf:ai_crawler as unknown', () => {
        const result = evaluatePurpose(['cf:ai_crawler'], 'balanced');
        expect(result.has_unknown_tokens).toBe(true);
        expect(result.unknown_tokens).toEqual(['cf:ai_crawler']);
      });
    });
  });

  describe('HTTP Status Codes', () => {
    describe('getPurposeStatusCode', () => {
      it('should return 200 for allow', () => {
        const result = evaluatePurpose(['train'], 'balanced');
        expect(getPurposeStatusCode(result)).toBe(200);
      });

      it('should return 402 for review', () => {
        const result = evaluatePurpose([], 'balanced');
        expect(getPurposeStatusCode(result)).toBe(402);
      });

      it('should return 403 for deny', () => {
        const result = evaluatePurpose([], 'strict');
        expect(getPurposeStatusCode(result)).toBe(403);
      });
    });
  });

  describe('Retry-After Header', () => {
    describe('getRetryAfter', () => {
      it('should return retry_after_s from constraints', () => {
        const constraints: PolicyConstraints = {
          rate_limit: { window_s: 3600, max: 100, retry_after_s: 60 },
        };
        expect(getRetryAfter(constraints)).toBe(60);
      });

      it('should return undefined when no rate_limit', () => {
        const constraints: PolicyConstraints = {
          budget: { max_requests: 100 },
        };
        expect(getRetryAfter(constraints)).toBeUndefined();
      });

      it('should return undefined when constraints undefined', () => {
        expect(getRetryAfter(undefined)).toBeUndefined();
      });

      it('should return undefined when no retry_after_s', () => {
        const constraints: PolicyConstraints = {
          rate_limit: { window_s: 3600, max: 100 },
        };
        expect(getRetryAfter(constraints)).toBeUndefined();
      });
    });
  });

  describe('PolicyConstraints Schema', () => {
    it('should validate rate_limit only', () => {
      const constraints: PolicyConstraints = {
        rate_limit: { window_s: 3600, max: 100 },
      };
      expect(constraints.rate_limit?.window_s).toBe(3600);
      expect(constraints.budget).toBeUndefined();
    });

    it('should validate budget only', () => {
      const constraints: PolicyConstraints = {
        budget: { max_tokens: 10000, max_requests: 1000 },
      };
      expect(constraints.budget?.max_tokens).toBe(10000);
      expect(constraints.rate_limit).toBeUndefined();
    });

    it('should validate both rate_limit and budget', () => {
      const constraints: PolicyConstraints = {
        rate_limit: { window_s: 60, max: 10 },
        budget: { max_requests: 100 },
      };
      expect(constraints.rate_limit?.max).toBe(10);
      expect(constraints.budget?.max_requests).toBe(100);
    });
  });

  describe('Integration with Policy Evaluation', () => {
    it('balanced profile should have sensible defaults', () => {
      // A request with no purpose should be rate-limited, not blocked
      const result = evaluatePurpose([], 'balanced');
      expect(result.decision).toBe('review');
      expect(result.constraints?.rate_limit?.max).toBe(100);
      expect(result.constraints?.rate_limit?.window_s).toBe(3600);
    });

    it('strict profile should block undeclared', () => {
      // A request with no purpose should be denied
      const result = evaluatePurpose([], 'strict');
      expect(result.decision).toBe('deny');
      expect(result.constraints).toBeUndefined();
    });

    it('open profile should allow everything', () => {
      // A request with no purpose should be allowed (recorded)
      const result = evaluatePurpose([], 'open');
      expect(result.decision).toBe('allow');
      expect(result.purpose_reason).toBe('undeclared_default');
    });
  });
});
