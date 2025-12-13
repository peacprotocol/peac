/**
 * Policy Kit Loader Tests
 *
 * Tests for policy parsing, validation, and serialization.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePolicy,
  validatePolicy,
  createExamplePolicy,
  serializePolicyYaml,
  serializePolicyJson,
  PolicyLoadError,
  PolicyValidationError,
  POLICY_VERSION,
  PolicyDocument,
} from '../src';

describe('parsePolicy', () => {
  it('should parse valid YAML policy', () => {
    const yaml = `
version: "peac-policy/0.1"
defaults:
  decision: deny
rules:
  - name: test-rule
    decision: allow
`;
    const policy = parsePolicy(yaml, 'yaml');

    expect(policy.version).toBe(POLICY_VERSION);
    expect(policy.defaults.decision).toBe('deny');
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0].name).toBe('test-rule');
  });

  it('should parse valid JSON policy', () => {
    const json = JSON.stringify({
      version: 'peac-policy/0.1',
      defaults: { decision: 'allow' },
      rules: [{ name: 'json-rule', decision: 'deny' }],
    });

    const policy = parsePolicy(json, 'json');

    expect(policy.version).toBe(POLICY_VERSION);
    expect(policy.defaults.decision).toBe('allow');
    expect(policy.rules[0].name).toBe('json-rule');
  });

  it('should auto-detect JSON format', () => {
    const json = JSON.stringify({
      version: 'peac-policy/0.1',
      defaults: { decision: 'deny' },
      rules: [],
    });

    const policy = parsePolicy(json);
    expect(policy.version).toBe(POLICY_VERSION);
  });

  it('should auto-detect YAML format', () => {
    const yaml = `
version: "peac-policy/0.1"
defaults:
  decision: review
rules: []
`;
    const policy = parsePolicy(yaml);
    expect(policy.defaults.decision).toBe('review');
  });

  it('should throw PolicyLoadError on invalid syntax', () => {
    expect(() => parsePolicy('{ invalid json', 'json')).toThrow(PolicyLoadError);
  });

  it('should throw PolicyValidationError on invalid schema', () => {
    const invalidPolicy = JSON.stringify({
      version: 'wrong-version',
      defaults: { decision: 'deny' },
      rules: [],
    });

    expect(() => parsePolicy(invalidPolicy)).toThrow(PolicyValidationError);
  });
});

describe('validatePolicy', () => {
  it('should validate a correct policy object', () => {
    const policy = {
      version: 'peac-policy/0.1',
      defaults: { decision: 'deny' },
      rules: [
        {
          name: 'valid-rule',
          subject: { type: 'human', labels: ['test'] },
          purpose: 'crawl',
          decision: 'allow',
        },
      ],
    };

    const validated = validatePolicy(policy);
    expect(validated.version).toBe(POLICY_VERSION);
  });

  it('should reject missing version', () => {
    expect(() =>
      validatePolicy({
        defaults: { decision: 'deny' },
        rules: [],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject invalid decision', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'maybe' },
        rules: [],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject invalid subject type', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [
          {
            name: 'bad-rule',
            subject: { type: 'robot' },
            decision: 'allow',
          },
        ],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject invalid purpose', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [
          {
            name: 'bad-rule',
            purpose: 'hack',
            decision: 'allow',
          },
        ],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject invalid licensing mode', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [
          {
            name: 'bad-rule',
            licensing_mode: 'free',
            decision: 'allow',
          },
        ],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject rule without name', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [{ decision: 'allow' }],
      })
    ).toThrow(PolicyValidationError);
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() =>
      validatePolicy({
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [],
        extraField: 'not allowed',
      })
    ).toThrow(PolicyValidationError);
  });
});

describe('createExamplePolicy', () => {
  it('should create a valid example policy', () => {
    const example = createExamplePolicy();

    expect(example.version).toBe(POLICY_VERSION);
    expect(example.defaults).toBeDefined();
    expect(example.rules.length).toBeGreaterThan(0);

    // Should be valid
    expect(() => validatePolicy(example)).not.toThrow();
  });

  it('should have meaningful example rules', () => {
    const example = createExamplePolicy();

    // Should have rules for different subject types
    const types = new Set(example.rules.map((r) => r.subject?.type).filter(Boolean));
    expect(types.size).toBeGreaterThanOrEqual(2);

    // Should have rules for different decisions
    const decisions = new Set(example.rules.map((r) => r.decision));
    expect(decisions.size).toBeGreaterThanOrEqual(2);
  });
});

describe('serializePolicyYaml', () => {
  it('should serialize policy to valid YAML', () => {
    const policy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'deny' },
      rules: [{ name: 'test', decision: 'allow' }],
    };

    const yaml = serializePolicyYaml(policy);

    expect(yaml).toContain('version:');
    expect(yaml).toContain('peac-policy/0.1');
    expect(yaml).toContain('defaults:');
    expect(yaml).toContain('rules:');

    // Should round-trip
    const parsed = parsePolicy(yaml, 'yaml');
    expect(parsed.version).toBe(policy.version);
  });
});

describe('serializePolicyJson', () => {
  it('should serialize policy to valid JSON (pretty)', () => {
    const policy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'allow' },
      rules: [{ name: 'json-test', decision: 'deny' }],
    };

    const json = serializePolicyJson(policy);

    expect(json).toContain('"version"');
    expect(json).toContain('\n'); // Pretty printed

    // Should round-trip
    const parsed = parsePolicy(json, 'json');
    expect(parsed.version).toBe(policy.version);
  });

  it('should serialize policy to compact JSON', () => {
    const policy: PolicyDocument = {
      version: POLICY_VERSION,
      defaults: { decision: 'deny' },
      rules: [],
    };

    const json = serializePolicyJson(policy, false);

    expect(json).not.toContain('\n');
  });
});

describe('complex policy validation', () => {
  it('should validate policy with all field types', () => {
    const complexPolicy = {
      version: 'peac-policy/0.1',
      name: 'Complex Test Policy',
      defaults: {
        decision: 'deny',
        reason: 'Default deny',
      },
      rules: [
        {
          name: 'comprehensive-rule',
          subject: {
            type: ['human', 'org'],
            labels: ['verified', 'premium'],
            id: 'user:*',
          },
          purpose: ['crawl', 'index', 'train'],
          licensing_mode: ['subscription', 'pay_per_crawl'],
          decision: 'allow',
          reason: 'Verified premium users/orgs can crawl/index/train',
        },
      ],
    };

    const validated = validatePolicy(complexPolicy);
    expect(validated.name).toBe('Complex Test Policy');
    expect(validated.rules[0].subject?.type).toEqual(['human', 'org']);
  });

  it('should validate all valid purposes', () => {
    const purposes = ['crawl', 'index', 'train', 'inference', 'ai_input', 'ai_search', 'search'];

    for (const purpose of purposes) {
      const policy = {
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [{ name: `test-${purpose}`, purpose, decision: 'allow' }],
      };

      expect(() => validatePolicy(policy)).not.toThrow();
    }
  });

  it('should validate all valid licensing modes', () => {
    const modes = ['subscription', 'pay_per_crawl', 'pay_per_inference'];

    for (const mode of modes) {
      const policy = {
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [{ name: `test-${mode}`, licensing_mode: mode, decision: 'allow' }],
      };

      expect(() => validatePolicy(policy)).not.toThrow();
    }
  });

  it('should validate all valid subject types', () => {
    const types = ['human', 'org', 'agent'];

    for (const type of types) {
      const policy = {
        version: 'peac-policy/0.1',
        defaults: { decision: 'deny' },
        rules: [{ name: `test-${type}`, subject: { type }, decision: 'allow' }],
      };

      expect(() => validatePolicy(policy)).not.toThrow();
    }
  });
});
