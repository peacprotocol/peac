/**
 * CAL Semantic Types Tests (v0.9.16+)
 *
 * Tests for ControlPurpose, ControlLicensingMode, and extended ControlStep fields.
 */

import { describe, it, expect } from 'vitest';
import {
  ControlPurposeSchema,
  ControlLicensingModeSchema,
  ControlDecisionSchema,
  ControlStepSchema,
  ChainControlBlockSchema,
} from '../src/validators';

describe('ControlPurposeSchema', () => {
  it('should accept valid purposes', () => {
    expect(ControlPurposeSchema.parse('crawl')).toBe('crawl');
    expect(ControlPurposeSchema.parse('index')).toBe('index');
    expect(ControlPurposeSchema.parse('train')).toBe('train');
    expect(ControlPurposeSchema.parse('inference')).toBe('inference');
  });

  it('should accept RSL-aligned purposes (v0.9.17+)', () => {
    expect(ControlPurposeSchema.parse('ai_input')).toBe('ai_input');
    expect(ControlPurposeSchema.parse('ai_search')).toBe('ai_search');
    expect(ControlPurposeSchema.parse('search')).toBe('search');
  });

  it('should reject invalid purposes', () => {
    expect(() => ControlPurposeSchema.parse('invalid')).toThrow();
    expect(() => ControlPurposeSchema.parse('')).toThrow();
    expect(() => ControlPurposeSchema.parse(123)).toThrow();
  });
});

describe('ControlLicensingModeSchema', () => {
  it('should accept valid licensing modes', () => {
    expect(ControlLicensingModeSchema.parse('subscription')).toBe('subscription');
    expect(ControlLicensingModeSchema.parse('pay_per_crawl')).toBe('pay_per_crawl');
    expect(ControlLicensingModeSchema.parse('pay_per_inference')).toBe('pay_per_inference');
  });

  it('should reject invalid licensing modes', () => {
    expect(() => ControlLicensingModeSchema.parse('invalid')).toThrow();
    expect(() => ControlLicensingModeSchema.parse('per_use')).toThrow();
    expect(() => ControlLicensingModeSchema.parse('')).toThrow();
  });
});

describe('ControlDecisionSchema', () => {
  it('should accept valid decisions', () => {
    expect(ControlDecisionSchema.parse('allow')).toBe('allow');
    expect(ControlDecisionSchema.parse('deny')).toBe('deny');
    expect(ControlDecisionSchema.parse('review')).toBe('review');
  });

  it('should reject invalid decisions', () => {
    expect(() => ControlDecisionSchema.parse('approved')).toThrow();
    expect(() => ControlDecisionSchema.parse('rejected')).toThrow();
  });
});

describe('ControlStepSchema', () => {
  it('should accept minimal valid step', () => {
    const step = {
      engine: 'test-engine',
      result: 'allow',
    };
    const parsed = ControlStepSchema.parse(step);
    expect(parsed.engine).toBe('test-engine');
    expect(parsed.result).toBe('allow');
  });

  it('should accept step with all optional fields', () => {
    const step = {
      engine: 'visa-tap',
      version: '1.0',
      policy_id: 'pol_123',
      result: 'allow',
      reason: 'within-limits',
      purpose: 'inference',
      licensing_mode: 'pay_per_inference',
      scope: 'https://api.example.com/*',
      limits_snapshot: { daily_limit: 1000 },
      evidence_ref: 'https://evidence.example.com/123',
    };
    const parsed = ControlStepSchema.parse(step);
    expect(parsed.purpose).toBe('inference');
    expect(parsed.licensing_mode).toBe('pay_per_inference');
    expect(parsed.scope).toBe('https://api.example.com/*');
  });

  it('should accept step with scope as array', () => {
    const step = {
      engine: 'content-policy',
      result: 'allow',
      scope: ['https://example.com/api/*', 'https://example.com/docs/*'],
    };
    const parsed = ControlStepSchema.parse(step);
    expect(Array.isArray(parsed.scope)).toBe(true);
    expect(parsed.scope).toHaveLength(2);
  });

  it('should reject step with invalid purpose', () => {
    const step = {
      engine: 'test-engine',
      result: 'allow',
      purpose: 'invalid-purpose',
    };
    expect(() => ControlStepSchema.parse(step)).toThrow();
  });

  it('should reject step with invalid licensing_mode', () => {
    const step = {
      engine: 'test-engine',
      result: 'allow',
      licensing_mode: 'free-tier',
    };
    expect(() => ControlStepSchema.parse(step)).toThrow();
  });

  it('should reject step without required engine field', () => {
    const step = {
      result: 'allow',
    };
    expect(() => ControlStepSchema.parse(step)).toThrow();
  });
});

describe('ChainControlBlockSchema', () => {
  it('should accept valid control block with single step', () => {
    const block = {
      chain: [{ engine: 'test-engine', result: 'allow' }],
      decision: 'allow',
    };
    const parsed = ChainControlBlockSchema.parse(block);
    expect(parsed.decision).toBe('allow');
    expect(parsed.chain).toHaveLength(1);
  });

  it('should accept control block with multiple steps', () => {
    const block = {
      chain: [
        { engine: 'spend-control', result: 'allow', purpose: 'inference' },
        { engine: 'risk-engine', result: 'allow' },
        { engine: 'merchant-policy', result: 'allow', licensing_mode: 'subscription' },
      ],
      decision: 'allow',
    };
    const parsed = ChainControlBlockSchema.parse(block);
    expect(parsed.chain).toHaveLength(3);
    expect(parsed.chain[0].purpose).toBe('inference');
    expect(parsed.chain[2].licensing_mode).toBe('subscription');
  });

  it('should accept control block with combinator', () => {
    const block = {
      chain: [{ engine: 'test-engine', result: 'allow' }],
      decision: 'allow',
      combinator: 'any_can_veto',
    };
    const parsed = ChainControlBlockSchema.parse(block);
    expect(parsed.combinator).toBe('any_can_veto');
  });

  it('should reject control block with empty chain', () => {
    const block = {
      chain: [],
      decision: 'allow',
    };
    expect(() => ChainControlBlockSchema.parse(block)).toThrow();
  });

  it('should enforce decision consistency - deny if any step denies', () => {
    const block = {
      chain: [
        { engine: 'engine-1', result: 'allow' },
        { engine: 'engine-2', result: 'deny' },
      ],
      decision: 'allow', // Inconsistent - should be deny
    };
    expect(() => ChainControlBlockSchema.parse(block)).toThrow();
  });

  it('should enforce decision consistency - allow only if all allow', () => {
    const block = {
      chain: [
        { engine: 'engine-1', result: 'allow' },
        { engine: 'engine-2', result: 'allow' },
      ],
      decision: 'deny', // Inconsistent - should be allow
    };
    expect(() => ChainControlBlockSchema.parse(block)).toThrow();
  });

  it('should allow review decision when chain has review but no deny', () => {
    const block = {
      chain: [
        { engine: 'engine-1', result: 'allow' },
        { engine: 'engine-2', result: 'review' },
      ],
      decision: 'review',
    };
    const parsed = ChainControlBlockSchema.parse(block);
    expect(parsed.decision).toBe('review');
  });

  it('should require deny decision when any step denies, even with review', () => {
    const block = {
      chain: [
        { engine: 'engine-1', result: 'review' },
        { engine: 'engine-2', result: 'deny' },
      ],
      decision: 'review', // Should be deny
    };
    expect(() => ChainControlBlockSchema.parse(block)).toThrow();
  });
});
