/**
 * Profile Loader API Tests
 */

import { describe, it, expect } from 'vitest';
import {
  listProfiles,
  hasProfile,
  loadProfile,
  getProfile,
  validateProfileParams,
  customizeProfile,
  getAllProfiles,
  getProfileSummary,
  ProfileError,
  PROFILE_IDS,
} from '../src';

describe('Profile Loader API', () => {
  describe('listProfiles', () => {
    it('returns all profile IDs', () => {
      const ids = listProfiles();
      expect(ids).toEqual(['api-provider', 'news-media', 'open-source', 'saas-docs']);
    });

    it('returns a copy, not the original array', () => {
      const ids1 = listProfiles();
      const ids2 = listProfiles();
      expect(ids1).not.toBe(ids2);
      expect(ids1).toEqual(ids2);
    });
  });

  describe('hasProfile', () => {
    it('returns true for valid profile IDs', () => {
      expect(hasProfile('news-media')).toBe(true);
      expect(hasProfile('api-provider')).toBe(true);
      expect(hasProfile('open-source')).toBe(true);
      expect(hasProfile('saas-docs')).toBe(true);
    });

    it('returns false for invalid profile IDs', () => {
      expect(hasProfile('invalid')).toBe(false);
      expect(hasProfile('')).toBe(false);
      expect(hasProfile('NEWS-MEDIA')).toBe(false); // Case-sensitive
    });

    it('acts as type guard', () => {
      const id: string = 'news-media';
      if (hasProfile(id)) {
        // Type should narrow to ProfileId
        const profile = loadProfile(id);
        expect(profile.id).toBe('news-media');
      }
    });
  });

  describe('loadProfile', () => {
    it('loads news-media profile', () => {
      const profile = loadProfile('news-media');
      expect(profile.id).toBe('news-media');
      expect(profile.name).toBe('News Media Publisher');
      expect(profile.policy.defaults.decision).toBe('deny');
    });

    it('loads api-provider profile', () => {
      const profile = loadProfile('api-provider');
      expect(profile.id).toBe('api-provider');
      expect(profile.name).toBe('API Provider');
    });

    it('loads open-source profile', () => {
      const profile = loadProfile('open-source');
      expect(profile.id).toBe('open-source');
      expect(profile.policy.defaults.decision).toBe('allow');
    });

    it('loads saas-docs profile', () => {
      const profile = loadProfile('saas-docs');
      expect(profile.id).toBe('saas-docs');
    });

    it('throws ProfileError for invalid ID', () => {
      expect(() => loadProfile('invalid' as any)).toThrow(ProfileError);
      expect(() => loadProfile('invalid' as any)).toThrow('Profile not found: invalid');
    });

    it('error has correct code', () => {
      try {
        loadProfile('invalid' as any);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ProfileError);
        expect((e as ProfileError).code).toBe('PROFILE_NOT_FOUND');
      }
    });
  });

  describe('getProfile', () => {
    it('returns profile for valid ID', () => {
      const profile = getProfile('news-media');
      expect(profile).toBeDefined();
      expect(profile!.id).toBe('news-media');
    });

    it('returns undefined for invalid ID', () => {
      const profile = getProfile('invalid');
      expect(profile).toBeUndefined();
    });

    it('does not throw for invalid ID', () => {
      expect(() => getProfile('invalid')).not.toThrow();
    });
  });

  describe('getAllProfiles', () => {
    it('returns all profiles as array', () => {
      const profiles = getAllProfiles();
      expect(profiles.length).toBe(4);
      expect(profiles.map((p) => p.id).sort()).toEqual([
        'api-provider',
        'news-media',
        'open-source',
        'saas-docs',
      ]);
    });

    it('profiles are in PROFILE_IDS order', () => {
      const profiles = getAllProfiles();
      const ids = profiles.map((p) => p.id);
      expect(ids).toEqual([...PROFILE_IDS]);
    });
  });

  describe('validateProfileParams', () => {
    describe('with news-media profile', () => {
      it('validates required contact parameter', () => {
        const result = validateProfileParams('news-media', {});
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].parameter).toBe('contact');
        expect(result.errors[0].code).toBe('MISSING_REQUIRED');
      });

      it('validates email format', () => {
        const result = validateProfileParams('news-media', {
          contact: 'invalid-email',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_FORMAT');
      });

      it('accepts valid email', () => {
        const result = validateProfileParams('news-media', {
          contact: 'licensing@example.com',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts valid rate_limit format', () => {
        const result = validateProfileParams('news-media', {
          contact: 'test@example.com',
          rate_limit: '100/hour',
        });
        expect(result.valid).toBe(true);
      });

      it('rejects invalid rate_limit format', () => {
        const result = validateProfileParams('news-media', {
          contact: 'test@example.com',
          rate_limit: 'invalid',
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0].parameter).toBe('rate_limit');
      });

      it('accepts valid URL for negotiate_url', () => {
        const result = validateProfileParams('news-media', {
          contact: 'test@example.com',
          negotiate_url: 'https://example.com/license',
        });
        expect(result.valid).toBe(true);
      });

      it('rejects invalid URL', () => {
        const result = validateProfileParams('news-media', {
          contact: 'test@example.com',
          negotiate_url: 'not-a-url',
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0].parameter).toBe('negotiate_url');
      });
    });

    describe('with open-source profile', () => {
      it('does not require any parameters', () => {
        const result = validateProfileParams('open-source', {});
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('accepts optional contact', () => {
        const result = validateProfileParams('open-source', {
          contact: 'maintainer@example.com',
        });
        expect(result.valid).toBe(true);
      });
    });

    it('rejects unknown parameters', () => {
      const result = validateProfileParams('open-source', {
        unknown_param: 'value',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('UNKNOWN_PARAMETER');
    });

    it('handles null/undefined values for optional params', () => {
      const result = validateProfileParams('open-source', {
        contact: undefined,
      });
      expect(result.valid).toBe(true);
    });

    it('handles null/undefined values for required params', () => {
      const result = validateProfileParams('news-media', {
        contact: null,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED');
    });

    it('accepts ProfileDefinition instead of ID', () => {
      const profile = loadProfile('news-media');
      const result = validateProfileParams(profile, {
        contact: 'test@example.com',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('customizeProfile', () => {
    it('produces valid policy document', () => {
      const result = customizeProfile('news-media', {
        contact: 'licensing@example.com',
      });
      expect(result.policy).toBeDefined();
      expect(result.policy.version).toBe('peac-policy/0.1');
      expect(result.policy.name).toBe('News Media Policy');
    });

    it('applies profile defaults', () => {
      const result = customizeProfile('news-media', {
        contact: 'licensing@example.com',
      });
      expect(result.appliedDefaults.requirements?.receipt).toBe(true);
      expect(result.appliedDefaults.rate_limit?.limit).toBe(100);
      expect(result.appliedDefaults.rate_limit?.window_seconds).toBe(3600);
    });

    it('applies parameter defaults', () => {
      const result = customizeProfile('news-media', {
        contact: 'licensing@example.com',
      });
      // rate_limit parameter has default '100/hour'
      expect(result.parameters.rate_limit).toBe('100/hour');
    });

    it('overrides defaults with provided values', () => {
      const result = customizeProfile('news-media', {
        contact: 'licensing@example.com',
        rate_limit: '200/hour',
      });
      expect(result.parameters.rate_limit).toBe('200/hour');
      expect(result.appliedDefaults.rate_limit?.limit).toBe(200);
    });

    it('throws on validation failure', () => {
      expect(() =>
        customizeProfile('news-media', {
          // Missing required contact
        })
      ).toThrow(ProfileError);

      expect(() =>
        customizeProfile('news-media', {
          contact: 'invalid-email',
        })
      ).toThrow(ProfileError);
    });

    it('error has VALIDATION_FAILED code', () => {
      try {
        customizeProfile('news-media', {});
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as ProfileError).code).toBe('VALIDATION_FAILED');
      }
    });

    it('works with open-source profile without params', () => {
      const result = customizeProfile('open-source', {});
      expect(result.policy.defaults.decision).toBe('allow');
      expect(result.policy.rules).toEqual([]);
    });

    it('policy is deep cloned from original', () => {
      const result = customizeProfile('open-source', {});
      const original = loadProfile('open-source');

      // Modify the result
      result.policy.name = 'Modified Name';

      // Original should be unchanged
      expect(original.policy.name).toBe('Open Source Policy');
    });

    it('accepts ProfileDefinition instead of ID', () => {
      const profile = loadProfile('open-source');
      const result = customizeProfile(profile, {});
      expect(result.policy).toBeDefined();
    });
  });

  describe('getProfileSummary', () => {
    it('returns summary for news-media', () => {
      const summary = getProfileSummary('news-media');
      expect(summary.id).toBe('news-media');
      expect(summary.name).toBe('News Media Publisher');
      expect(summary.defaultDecision).toBe('deny');
      expect(summary.ruleCount).toBe(3);
      expect(summary.requiresReceipt).toBe(true);
      expect(summary.requiredParams).toEqual(['contact']);
      expect(summary.optionalParams).toContain('rate_limit');
      expect(summary.optionalParams).toContain('negotiate_url');
    });

    it('returns summary for open-source', () => {
      const summary = getProfileSummary('open-source');
      expect(summary.defaultDecision).toBe('allow');
      expect(summary.ruleCount).toBe(0);
      expect(summary.requiresReceipt).toBe(false);
      expect(summary.requiredParams).toEqual([]);
    });

    it('returns summary for api-provider', () => {
      const summary = getProfileSummary('api-provider');
      expect(summary.id).toBe('api-provider');
      expect(summary.requiresReceipt).toBe(true);
      expect(summary.requiredParams).toEqual(['contact']);
    });

    it('returns summary for saas-docs', () => {
      const summary = getProfileSummary('saas-docs');
      expect(summary.id).toBe('saas-docs');
      expect(summary.defaultDecision).toBe('allow');
      expect(summary.ruleCount).toBe(1); // Only block-training rule
    });

    it('accepts ProfileDefinition instead of ID', () => {
      const profile = loadProfile('news-media');
      const summary = getProfileSummary(profile);
      expect(summary.id).toBe('news-media');
    });

    it('params are sorted alphabetically', () => {
      const summary = getProfileSummary('news-media');
      const sorted = [...summary.optionalParams].sort();
      expect(summary.optionalParams).toEqual(sorted);
    });
  });

  describe('ProfileError', () => {
    it('is an Error instance', () => {
      const error = new ProfileError('test', 'PROFILE_NOT_FOUND');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ProfileError);
    });

    it('has name and code properties', () => {
      const error = new ProfileError('test message', 'VALIDATION_FAILED');
      expect(error.name).toBe('ProfileError');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('VALIDATION_FAILED');
    });
  });
});
