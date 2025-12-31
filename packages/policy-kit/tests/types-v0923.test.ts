/**
 * Policy Kit v0.9.23 Types Tests
 *
 * Tests for new types added in v0.9.23:
 * - RateLimitConfig
 * - DecisionRequirements
 * - ProfileParameter
 * - ProfileDefinition
 */

import { describe, it, expect } from 'vitest';
import {
  RateLimitConfigSchema,
  DecisionRequirementsSchema,
  ProfileParameterSchema,
  ProfileDefinitionSchema,
  parseRateLimit,
  formatRateLimit,
  POLICY_VERSION,
  type RateLimitConfig,
  type ProfileDefinition,
} from '../src';

describe('RateLimitConfig', () => {
  describe('schema validation', () => {
    it('accepts valid rate limit config', () => {
      const config = {
        limit: 100,
        window_seconds: 3600,
      };
      expect(RateLimitConfigSchema.parse(config)).toEqual(config);
    });

    it('accepts config with optional fields', () => {
      const config = {
        limit: 100,
        window_seconds: 3600,
        burst: 10,
        partition: 'agent' as const,
      };
      expect(RateLimitConfigSchema.parse(config)).toEqual(config);
    });

    it('accepts custom partition string', () => {
      const config = {
        limit: 100,
        window_seconds: 3600,
        partition: 'custom-partition',
      };
      expect(RateLimitConfigSchema.parse(config)).toEqual(config);
    });

    it('rejects non-positive limit', () => {
      expect(() => RateLimitConfigSchema.parse({ limit: 0, window_seconds: 3600 })).toThrow();
      expect(() => RateLimitConfigSchema.parse({ limit: -1, window_seconds: 3600 })).toThrow();
    });

    it('rejects non-positive window', () => {
      expect(() => RateLimitConfigSchema.parse({ limit: 100, window_seconds: 0 })).toThrow();
    });

    it('rejects non-integer values', () => {
      expect(() => RateLimitConfigSchema.parse({ limit: 100.5, window_seconds: 3600 })).toThrow();
    });

    it('rejects negative burst', () => {
      expect(() =>
        RateLimitConfigSchema.parse({ limit: 100, window_seconds: 3600, burst: -1 })
      ).toThrow();
    });

    it('rejects extra fields (strict)', () => {
      expect(() =>
        RateLimitConfigSchema.parse({
          limit: 100,
          window_seconds: 3600,
          extra: 'field',
        })
      ).toThrow();
    });
  });

  describe('parseRateLimit', () => {
    it('parses "100/hour"', () => {
      expect(parseRateLimit('100/hour')).toEqual({
        limit: 100,
        window_seconds: 3600,
      });
    });

    it('parses "1000/day"', () => {
      expect(parseRateLimit('1000/day')).toEqual({
        limit: 1000,
        window_seconds: 86400,
      });
    });

    it('parses "10/minute"', () => {
      expect(parseRateLimit('10/minute')).toEqual({
        limit: 10,
        window_seconds: 60,
      });
    });

    it('parses "5/second"', () => {
      expect(parseRateLimit('5/second')).toEqual({
        limit: 5,
        window_seconds: 1,
      });
    });

    it('is case-insensitive', () => {
      expect(parseRateLimit('100/HOUR')).toEqual({
        limit: 100,
        window_seconds: 3600,
      });
      expect(parseRateLimit('100/Hour')).toEqual({
        limit: 100,
        window_seconds: 3600,
      });
    });

    it('throws on invalid format', () => {
      expect(() => parseRateLimit('invalid')).toThrow(/Invalid rate limit format/);
      expect(() => parseRateLimit('100')).toThrow(/Invalid rate limit format/);
      expect(() => parseRateLimit('100/week')).toThrow(/Invalid rate limit format/);
      expect(() => parseRateLimit('/hour')).toThrow(/Invalid rate limit format/);
    });
  });

  describe('formatRateLimit', () => {
    it('formats standard windows', () => {
      expect(formatRateLimit({ limit: 5, window_seconds: 1 })).toBe('5/second');
      expect(formatRateLimit({ limit: 10, window_seconds: 60 })).toBe('10/minute');
      expect(formatRateLimit({ limit: 100, window_seconds: 3600 })).toBe('100/hour');
      expect(formatRateLimit({ limit: 1000, window_seconds: 86400 })).toBe('1000/day');
    });

    it('formats custom windows', () => {
      expect(formatRateLimit({ limit: 100, window_seconds: 120 })).toBe('100/120s');
      expect(formatRateLimit({ limit: 50, window_seconds: 7200 })).toBe('50/7200s');
    });

    it('roundtrips with parseRateLimit', () => {
      const inputs = ['5/second', '10/minute', '100/hour', '1000/day'];
      for (const input of inputs) {
        const parsed = parseRateLimit(input);
        const formatted = formatRateLimit(parsed);
        expect(formatted).toBe(input);
      }
    });
  });
});

describe('DecisionRequirements', () => {
  it('accepts empty requirements', () => {
    expect(DecisionRequirementsSchema.parse({})).toEqual({});
  });

  it('accepts receipt requirement', () => {
    expect(DecisionRequirementsSchema.parse({ receipt: true })).toEqual({
      receipt: true,
    });
    expect(DecisionRequirementsSchema.parse({ receipt: false })).toEqual({
      receipt: false,
    });
  });

  it('rejects non-boolean receipt', () => {
    expect(() => DecisionRequirementsSchema.parse({ receipt: 'yes' })).toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() => DecisionRequirementsSchema.parse({ receipt: true, extra: 'field' })).toThrow();
  });
});

describe('ProfileParameter', () => {
  it('accepts minimal parameter', () => {
    const param = { description: 'Test parameter' };
    expect(ProfileParameterSchema.parse(param)).toEqual(param);
  });

  it('accepts full parameter', () => {
    const param = {
      description: 'Contact email',
      required: true,
      default: 'test@example.com',
      example: 'user@example.com',
      validate: 'email' as const,
    };
    expect(ProfileParameterSchema.parse(param)).toEqual(param);
  });

  it('accepts different default types', () => {
    expect(ProfileParameterSchema.parse({ description: 'Test', default: 'string' })).toBeDefined();
    expect(ProfileParameterSchema.parse({ description: 'Test', default: 100 })).toBeDefined();
    expect(ProfileParameterSchema.parse({ description: 'Test', default: true })).toBeDefined();
  });

  it('accepts valid validate types', () => {
    expect(ProfileParameterSchema.parse({ description: 'Test', validate: 'email' })).toBeDefined();
    expect(ProfileParameterSchema.parse({ description: 'Test', validate: 'url' })).toBeDefined();
    expect(
      ProfileParameterSchema.parse({ description: 'Test', validate: 'rate_limit' })
    ).toBeDefined();
  });

  it('rejects invalid validate type', () => {
    expect(() =>
      ProfileParameterSchema.parse({ description: 'Test', validate: 'invalid' })
    ).toThrow();
  });

  it('rejects empty description', () => {
    expect(() => ProfileParameterSchema.parse({ description: '' })).toThrow();
  });
});

describe('ProfileDefinition', () => {
  const validProfile: ProfileDefinition = {
    id: 'news-media',
    name: 'News Media Publisher',
    description: 'Policy for news and media publishers.',
    policy: {
      version: POLICY_VERSION,
      name: 'News Media Policy',
      defaults: { decision: 'deny' },
      rules: [
        {
          name: 'allow-search',
          purpose: ['crawl', 'index'],
          decision: 'allow',
        },
      ],
    },
    parameters: {
      contact: {
        description: 'Contact email',
        required: true,
        validate: 'email',
      },
    },
  };

  it('accepts valid profile', () => {
    expect(ProfileDefinitionSchema.parse(validProfile)).toEqual(validProfile);
  });

  it('accepts profile with defaults', () => {
    const profileWithDefaults: ProfileDefinition = {
      ...validProfile,
      defaults: {
        requirements: { receipt: true },
        rate_limit: { limit: 100, window_seconds: 3600 },
      },
    };
    expect(ProfileDefinitionSchema.parse(profileWithDefaults)).toEqual(profileWithDefaults);
  });

  it('validates id format (lowercase, starts with letter)', () => {
    expect(() => ProfileDefinitionSchema.parse({ ...validProfile, id: 'News-Media' })).toThrow(); // uppercase

    expect(() => ProfileDefinitionSchema.parse({ ...validProfile, id: '123-test' })).toThrow(); // starts with number

    expect(() =>
      ProfileDefinitionSchema.parse({ ...validProfile, id: 'valid-id-123' })
    ).not.toThrow();
  });

  it('validates nested policy document', () => {
    const invalidPolicy = {
      ...validProfile,
      policy: {
        ...validProfile.policy,
        version: 'invalid-version',
      },
    };
    expect(() => ProfileDefinitionSchema.parse(invalidPolicy)).toThrow();
  });

  it('validates nested parameters', () => {
    const invalidParams = {
      ...validProfile,
      parameters: {
        bad: { description: '', required: true }, // empty description
      },
    };
    expect(() => ProfileDefinitionSchema.parse(invalidParams)).toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() => ProfileDefinitionSchema.parse({ ...validProfile, extra: 'field' })).toThrow();
  });
});
