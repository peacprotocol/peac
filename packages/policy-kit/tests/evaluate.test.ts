/**
 * Policy Kit Evaluation Tests
 *
 * Tests for deterministic policy evaluation.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  explainMatches,
  findEffectiveRule,
  isAllowed,
  isDenied,
  requiresReview,
  evaluateBatch,
  POLICY_VERSION,
  PolicyDocument,
  EvaluationContext,
} from '../src';

/**
 * Create a test policy with comprehensive rules
 */
function createTestPolicy(): PolicyDocument {
  return {
    version: POLICY_VERSION,
    name: 'Test Policy',
    defaults: {
      decision: 'deny',
      reason: 'No matching rule found',
    },
    rules: [
      {
        name: 'allow-subscribed-humans-crawl',
        subject: {
          type: 'human',
          labels: ['subscribed'],
        },
        purpose: 'crawl',
        licensing_mode: 'subscription',
        decision: 'allow',
        reason: 'Subscribed humans can crawl',
      },
      {
        name: 'allow-verified-agents-inference',
        subject: {
          type: 'agent',
          labels: ['verified'],
        },
        purpose: ['inference', 'ai_input'],
        licensing_mode: 'pay_per_inference',
        decision: 'allow',
        reason: 'Verified agents can run inference',
      },
      {
        name: 'allow-org-index',
        subject: {
          type: 'org',
        },
        purpose: 'index',
        decision: 'allow',
        reason: 'Any org can index',
      },
      {
        name: 'review-train',
        purpose: 'train',
        decision: 'review',
        reason: 'All training requires review',
      },
      {
        name: 'allow-premium-users-all',
        subject: {
          type: 'human',
          labels: ['premium'],
        },
        decision: 'allow',
        reason: 'Premium users can do anything',
      },
      {
        name: 'allow-by-id-prefix',
        subject: {
          id: 'internal:*',
        },
        decision: 'allow',
        reason: 'Internal subjects allowed',
      },
    ],
  };
}

describe('evaluate', () => {
  const policy = createTestPolicy();

  it('should match first rule when multiple rules apply', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: ['subscribed', 'premium'] },
      purpose: 'crawl',
      licensing_mode: 'subscription',
    });

    // First matching rule is allow-subscribed-humans-crawl
    expect(result.decision).toBe('allow');
    expect(result.matched_rule).toBe('allow-subscribed-humans-crawl');
    expect(result.is_default).toBe(false);
  });

  it('should apply default when no rule matches', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: [] },
      purpose: 'index',
    });

    expect(result.decision).toBe('deny');
    expect(result.matched_rule).toBeUndefined();
    expect(result.reason).toBe('No matching rule found');
    expect(result.is_default).toBe(true);
  });

  it('should match rule with array of purposes', () => {
    const result = evaluate(policy, {
      subject: { type: 'agent', labels: ['verified'] },
      purpose: 'ai_input',
      licensing_mode: 'pay_per_inference',
    });

    expect(result.decision).toBe('allow');
    expect(result.matched_rule).toBe('allow-verified-agents-inference');
  });

  it('should match rule without subject constraint', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: [] },
      purpose: 'train',
    });

    expect(result.decision).toBe('review');
    expect(result.matched_rule).toBe('review-train');
  });

  it('should match rule without purpose constraint', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: ['premium'] },
      purpose: 'search',
    });

    expect(result.decision).toBe('allow');
    expect(result.matched_rule).toBe('allow-premium-users-all');
  });

  it('should require all labels to match', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: ['verified'] }, // has verified, not subscribed
      purpose: 'crawl',
      licensing_mode: 'subscription',
    });

    // Should not match allow-subscribed-humans-crawl
    expect(result.matched_rule).not.toBe('allow-subscribed-humans-crawl');
  });

  it('should match subject ID prefix pattern', () => {
    const result = evaluate(policy, {
      subject: { id: 'internal:service-123' },
      purpose: 'inference',
    });

    expect(result.decision).toBe('allow');
    expect(result.matched_rule).toBe('allow-by-id-prefix');
  });

  it('should not match subject ID without pattern', () => {
    const result = evaluate(policy, {
      subject: { id: 'external:user-456' },
      purpose: 'inference',
    });

    // Should not match allow-by-id-prefix
    expect(result.matched_rule).not.toBe('allow-by-id-prefix');
  });
});

describe('evaluate with empty context', () => {
  const policy = createTestPolicy();

  it('should handle empty context', () => {
    const result = evaluate(policy, {});

    // review-train matches (no subject constraint, purpose undefined matches any)
    // Actually, purpose: 'train' doesn't match undefined purpose
    // allow-premium-users-all needs type=human
    // So default should apply
    expect(result.is_default).toBe(true);
    expect(result.decision).toBe('deny');
  });
});

describe('evaluate with partial context', () => {
  const policy = createTestPolicy();

  it('should handle context with only subject', () => {
    const result = evaluate(policy, {
      subject: { type: 'human', labels: ['premium'] },
    });

    // allow-premium-users-all has no purpose/licensing_mode constraint
    expect(result.decision).toBe('allow');
    expect(result.matched_rule).toBe('allow-premium-users-all');
  });

  it('should handle context with only purpose', () => {
    const result = evaluate(policy, {
      purpose: 'train',
    });

    // review-train has no subject constraint
    expect(result.decision).toBe('review');
    expect(result.matched_rule).toBe('review-train');
  });
});

describe('explainMatches', () => {
  const policy = createTestPolicy();

  it('should return all matching rules', () => {
    const matches = explainMatches(policy, {
      subject: { type: 'human', labels: ['subscribed', 'premium'] },
      purpose: 'crawl',
      licensing_mode: 'subscription',
    });

    // Both allow-subscribed-humans-crawl and allow-premium-users-all match
    expect(matches).toContain('allow-subscribed-humans-crawl');
    expect(matches).toContain('allow-premium-users-all');
  });

  it('should return [default] when no rules match', () => {
    const matches = explainMatches(policy, {
      subject: { type: 'human', labels: [] },
      purpose: 'index',
    });

    expect(matches).toEqual(['[default]']);
  });
});

describe('findEffectiveRule', () => {
  const policy = createTestPolicy();

  it('should return the first matching rule', () => {
    const rule = findEffectiveRule(policy, {
      subject: { type: 'agent', labels: ['verified'] },
      purpose: 'inference',
      licensing_mode: 'pay_per_inference',
    });

    expect(rule).not.toBeUndefined();
    expect(rule?.name).toBe('allow-verified-agents-inference');
  });

  it('should return undefined when no rule matches', () => {
    const rule = findEffectiveRule(policy, {
      subject: { type: 'human', labels: [] },
      purpose: 'index',
    });

    expect(rule).toBeUndefined();
  });
});

describe('convenience helpers', () => {
  const policy = createTestPolicy();

  describe('isAllowed', () => {
    it('should return true for allowed contexts', () => {
      expect(
        isAllowed(policy, {
          subject: { type: 'org' },
          purpose: 'index',
        })
      ).toBe(true);
    });

    it('should return false for denied contexts', () => {
      expect(
        isAllowed(policy, {
          subject: { type: 'human', labels: [] },
          purpose: 'index',
        })
      ).toBe(false);
    });
  });

  describe('isDenied', () => {
    it('should return true for denied contexts', () => {
      expect(
        isDenied(policy, {
          subject: { type: 'human', labels: [] },
          purpose: 'index',
        })
      ).toBe(true);
    });

    it('should return false for allowed contexts', () => {
      expect(
        isDenied(policy, {
          subject: { type: 'org' },
          purpose: 'index',
        })
      ).toBe(false);
    });
  });

  describe('requiresReview', () => {
    it('should return true for review contexts', () => {
      expect(
        requiresReview(policy, {
          purpose: 'train',
        })
      ).toBe(true);
    });

    it('should return false for non-review contexts', () => {
      expect(
        requiresReview(policy, {
          subject: { type: 'org' },
          purpose: 'index',
        })
      ).toBe(false);
    });
  });
});

describe('evaluateBatch', () => {
  const policy = createTestPolicy();

  it('should evaluate multiple contexts', () => {
    const contexts: EvaluationContext[] = [
      { subject: { type: 'org' }, purpose: 'index' },
      { purpose: 'train' },
      { subject: { type: 'human', labels: [] }, purpose: 'index' },
    ];

    const results = evaluateBatch(policy, contexts);

    expect(results).toHaveLength(3);
    expect(results[0].decision).toBe('allow');
    expect(results[1].decision).toBe('review');
    expect(results[2].decision).toBe('deny');
  });

  it('should handle empty batch', () => {
    const results = evaluateBatch(policy, []);
    expect(results).toHaveLength(0);
  });
});

describe('edge cases', () => {
  it('should handle policy with no rules', () => {
    const emptyRulesPolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'allow' },
      rules: [],
    };

    const result = evaluate(emptyRulesPolicy, {
      subject: { type: 'human' },
      purpose: 'crawl',
    });

    expect(result.decision).toBe('allow');
    expect(result.is_default).toBe(true);
  });

  it('should handle subject with exact ID match', () => {
    const idMatchPolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'deny' },
      rules: [
        {
          name: 'exact-id-match',
          subject: { id: 'user:specific-123' },
          decision: 'allow',
        },
      ],
    };

    // Exact match
    expect(
      isAllowed(idMatchPolicy, {
        subject: { id: 'user:specific-123' },
      })
    ).toBe(true);

    // Different ID
    expect(
      isAllowed(idMatchPolicy, {
        subject: { id: 'user:specific-456' },
      })
    ).toBe(false);
  });

  it('should handle multiple subject types in rule', () => {
    const multiTypePolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'deny' },
      rules: [
        {
          name: 'multi-type',
          subject: { type: ['human', 'org'] },
          decision: 'allow',
        },
      ],
    };

    expect(isAllowed(multiTypePolicy, { subject: { type: 'human' } })).toBe(true);
    expect(isAllowed(multiTypePolicy, { subject: { type: 'org' } })).toBe(true);
    expect(isAllowed(multiTypePolicy, { subject: { type: 'agent' } })).toBe(false);
  });

  it('should handle multiple licensing modes in rule', () => {
    const multiModePolicy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'deny' },
      rules: [
        {
          name: 'multi-mode',
          licensing_mode: ['subscription', 'pay_per_crawl'],
          decision: 'allow',
        },
      ],
    };

    expect(isAllowed(multiModePolicy, { licensing_mode: 'subscription' })).toBe(true);
    expect(isAllowed(multiModePolicy, { licensing_mode: 'pay_per_crawl' })).toBe(true);
    expect(isAllowed(multiModePolicy, { licensing_mode: 'pay_per_inference' })).toBe(false);
  });
});
