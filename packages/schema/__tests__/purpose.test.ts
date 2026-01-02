/**
 * Purpose type and validation tests (v0.9.24+)
 */
import { describe, it, expect } from 'vitest';
import {
  // Types
  type PurposeToken,
  type CanonicalPurpose,
  type PurposeReason,
  type LegacyPurpose,
  // Constants
  PURPOSE_TOKEN_REGEX,
  MAX_PURPOSE_TOKEN_LENGTH,
  MAX_PURPOSE_TOKENS_PER_REQUEST,
  CANONICAL_PURPOSES,
  PURPOSE_REASONS,
  INTERNAL_PURPOSE_UNDECLARED,
  // Validation functions
  isValidPurposeToken,
  isCanonicalPurpose,
  isLegacyPurpose,
  isValidPurposeReason,
  isUndeclaredPurpose,
  // Normalization functions
  normalizePurposeToken,
  parsePurposeHeader,
  validatePurposeTokens,
  deriveKnownPurposes,
  // Legacy mapping
  mapLegacyToCanonical,
  normalizeToCanonicalOrPreserve,
} from '../src/purpose';

// Also test Zod validators
import { PurposeTokenSchema, CanonicalPurposeSchema, PurposeReasonSchema } from '../src/validators';

describe('Purpose Types (v0.9.24+)', () => {
  describe('Constants', () => {
    it('should have correct canonical purposes', () => {
      expect(CANONICAL_PURPOSES).toEqual(['train', 'search', 'user_action', 'inference', 'index']);
    });

    it('should have correct purpose reasons', () => {
      expect(PURPOSE_REASONS).toEqual([
        'allowed',
        'constrained',
        'denied',
        'downgraded',
        'undeclared_default',
        'unknown_preserved',
      ]);
    });

    it('should have internal undeclared value', () => {
      expect(INTERNAL_PURPOSE_UNDECLARED).toBe('undeclared');
    });

    it('should have reasonable limits', () => {
      expect(MAX_PURPOSE_TOKEN_LENGTH).toBe(64);
      expect(MAX_PURPOSE_TOKENS_PER_REQUEST).toBe(10);
    });
  });

  describe('PurposeToken Validation', () => {
    describe('valid tokens', () => {
      const validTokens = [
        'train',
        'search',
        'user_action',
        'inference',
        'index',
        'crawl',
        'ai_input',
        'ai_index',
        'custom_purpose',
        'a',
        'ab',
        'a1',
        'a_1',
        'train123',
        'my_custom_purpose_with_underscores',
      ];

      validTokens.forEach((token) => {
        it(`should accept valid token: "${token}"`, () => {
          expect(isValidPurposeToken(token)).toBe(true);
          expect(PURPOSE_TOKEN_REGEX.test(token)).toBe(true);
        });
      });
    });

    describe('valid hyphenated tokens (interop)', () => {
      // Hyphens allowed for interop with external systems (Cloudflare, IETF AIPREF, etc.)
      const hyphenatedTokens = [
        'user-action', // Cloudflare style
        'train-ai', // IETF AIPREF style
        'train-genai', // IETF AIPREF extension
        'ai-crawler',
        'my-custom-purpose',
        'a-b',
        'a-1',
        'a-b-c-d',
        'purpose-with-multiple-hyphens',
      ];

      hyphenatedTokens.forEach((token) => {
        it(`should accept hyphenated token: "${token}"`, () => {
          expect(isValidPurposeToken(token)).toBe(true);
          expect(PURPOSE_TOKEN_REGEX.test(token)).toBe(true);
        });
      });
    });

    describe('valid vendor-prefixed tokens', () => {
      const validVendorTokens = [
        'cf:ai_crawler',
        'cf:ai-crawler', // hyphenated suffix
        'vendor:custom_purpose',
        'vendor:custom-purpose', // hyphenated suffix
        'peac:experimental',
        'akamai:bot_check',
        'akamai:bot-check', // hyphenated suffix
        'fastly:edge_compute',
        'fastly:edge-compute', // hyphenated suffix
        'x:y',
      ];

      validVendorTokens.forEach((token) => {
        it(`should accept vendor-prefixed token: "${token}"`, () => {
          expect(isValidPurposeToken(token)).toBe(true);
          expect(PURPOSE_TOKEN_REGEX.test(token)).toBe(true);
        });
      });
    });

    describe('invalid tokens', () => {
      const invalidTokens = [
        '', // empty
        '   ', // whitespace only
        'Train', // uppercase
        'USER_ACTION', // all caps
        '123abc', // starts with number
        '_train', // starts with underscore
        '-train', // starts with hyphen
        'train!', // special character
        'train@search', // @ symbol
        'a'.repeat(65), // too long
        ':prefix', // starts with colon
        'prefix:', // ends with colon
        'pre:fix:extra', // multiple colons
        'Pre:fix', // uppercase in prefix
        'pre:Fix', // uppercase in suffix
      ];

      invalidTokens.forEach((token) => {
        it(`should reject invalid token: "${token.slice(0, 20)}${token.length > 20 ? '...' : ''}"`, () => {
          expect(isValidPurposeToken(token)).toBe(false);
        });
      });

      it('should reject non-string values', () => {
        expect(isValidPurposeToken(123 as unknown as string)).toBe(false);
        expect(isValidPurposeToken(null as unknown as string)).toBe(false);
        expect(isValidPurposeToken(undefined as unknown as string)).toBe(false);
        expect(isValidPurposeToken({} as unknown as string)).toBe(false);
      });
    });

    describe('length limits', () => {
      it('should accept token at max length', () => {
        const maxToken = 'a'.repeat(64);
        expect(isValidPurposeToken(maxToken)).toBe(true);
      });

      it('should reject token over max length', () => {
        const overToken = 'a'.repeat(65);
        expect(isValidPurposeToken(overToken)).toBe(false);
      });
    });
  });

  describe('CanonicalPurpose Validation', () => {
    it('should accept all canonical purposes', () => {
      const canonical: CanonicalPurpose[] = [
        'train',
        'search',
        'user_action',
        'inference',
        'index',
      ];
      canonical.forEach((purpose) => {
        expect(isCanonicalPurpose(purpose)).toBe(true);
      });
    });

    it('should reject non-canonical purposes', () => {
      expect(isCanonicalPurpose('crawl')).toBe(false);
      expect(isCanonicalPurpose('ai_input')).toBe(false);
      expect(isCanonicalPurpose('ai_index')).toBe(false);
      expect(isCanonicalPurpose('unknown')).toBe(false);
      expect(isCanonicalPurpose('cf:ai_crawler')).toBe(false);
    });
  });

  describe('LegacyPurpose Validation', () => {
    it('should accept legacy purposes', () => {
      expect(isLegacyPurpose('crawl')).toBe(true);
      expect(isLegacyPurpose('ai_input')).toBe(true);
      expect(isLegacyPurpose('ai_index')).toBe(true);
    });

    it('should reject non-legacy purposes', () => {
      expect(isLegacyPurpose('train')).toBe(false);
      expect(isLegacyPurpose('search')).toBe(false);
      expect(isLegacyPurpose('unknown')).toBe(false);
    });
  });

  describe('PurposeReason Validation', () => {
    it('should accept all valid reasons', () => {
      const reasons: PurposeReason[] = [
        'allowed',
        'constrained',
        'denied',
        'downgraded',
        'undeclared_default',
        'unknown_preserved',
      ];
      reasons.forEach((reason) => {
        expect(isValidPurposeReason(reason)).toBe(true);
      });
    });

    it('should reject invalid reasons', () => {
      expect(isValidPurposeReason('invalid')).toBe(false);
      expect(isValidPurposeReason('allow')).toBe(false);
      expect(isValidPurposeReason('')).toBe(false);
    });
  });

  describe('Undeclared Purpose Check', () => {
    it('should detect undeclared purpose', () => {
      expect(isUndeclaredPurpose('undeclared')).toBe(true);
    });

    it('should not match other tokens', () => {
      expect(isUndeclaredPurpose('train')).toBe(false);
      expect(isUndeclaredPurpose('Undeclared')).toBe(false);
      expect(isUndeclaredPurpose('')).toBe(false);
    });
  });
});

describe('Purpose Normalization', () => {
  describe('normalizePurposeToken', () => {
    it('should lowercase tokens', () => {
      expect(normalizePurposeToken('TRAIN')).toBe('train');
      expect(normalizePurposeToken('Train')).toBe('train');
      expect(normalizePurposeToken('USER_ACTION')).toBe('user_action');
    });

    it('should trim whitespace', () => {
      expect(normalizePurposeToken('  train  ')).toBe('train');
      expect(normalizePurposeToken('\ttrain\n')).toBe('train');
    });

    it('should handle vendor prefixes', () => {
      expect(normalizePurposeToken('CF:AI_CRAWLER')).toBe('cf:ai_crawler');
    });
  });

  describe('parsePurposeHeader', () => {
    it('should parse single purpose', () => {
      expect(parsePurposeHeader('train')).toEqual(['train']);
    });

    it('should parse multiple purposes', () => {
      expect(parsePurposeHeader('train, search')).toEqual(['train', 'search']);
      expect(parsePurposeHeader('train,search,inference')).toEqual([
        'train',
        'search',
        'inference',
      ]);
    });

    it('should handle whitespace', () => {
      expect(parsePurposeHeader('  train  ,  search  ')).toEqual(['train', 'search']);
      expect(parsePurposeHeader('train , search')).toEqual(['train', 'search']);
    });

    it('should lowercase all tokens', () => {
      expect(parsePurposeHeader('TRAIN, SEARCH')).toEqual(['train', 'search']);
    });

    it('should deduplicate tokens', () => {
      expect(parsePurposeHeader('train, train, search')).toEqual(['train', 'search']);
    });

    it('should preserve order', () => {
      expect(parsePurposeHeader('search, train, inference')).toEqual([
        'search',
        'train',
        'inference',
      ]);
    });

    it('should drop empty tokens', () => {
      expect(parsePurposeHeader('train,,search')).toEqual(['train', 'search']);
      expect(parsePurposeHeader(',train,')).toEqual(['train']);
    });

    it('should return empty array for empty/null input', () => {
      expect(parsePurposeHeader('')).toEqual([]);
      expect(parsePurposeHeader(null as unknown as string)).toEqual([]);
      expect(parsePurposeHeader(undefined as unknown as string)).toEqual([]);
    });

    it('should handle vendor prefixes', () => {
      expect(parsePurposeHeader('train, cf:ai_crawler')).toEqual(['train', 'cf:ai_crawler']);
    });
  });

  describe('validatePurposeTokens', () => {
    it('should validate all valid tokens', () => {
      const result = validatePurposeTokens(['train', 'search', 'user_action']);
      expect(result.valid).toBe(true);
      expect(result.tokens).toEqual(['train', 'search', 'user_action']);
      expect(result.invalidTokens).toEqual([]);
      expect(result.undeclaredPresent).toBe(false);
    });

    it('should detect invalid tokens', () => {
      const result = validatePurposeTokens(['train', 'INVALID!', 'search']);
      expect(result.valid).toBe(false);
      expect(result.invalidTokens).toContain('INVALID!');
    });

    it('should detect explicit undeclared', () => {
      const result = validatePurposeTokens(['train', 'undeclared']);
      expect(result.valid).toBe(false);
      expect(result.undeclaredPresent).toBe(true);
    });

    it('should preserve unknown but valid tokens', () => {
      const result = validatePurposeTokens(['train', 'unknown_vendor_purpose']);
      expect(result.valid).toBe(true);
      expect(result.tokens).toContain('unknown_vendor_purpose');
    });

    it('should validate empty array', () => {
      const result = validatePurposeTokens([]);
      expect(result.valid).toBe(true);
      expect(result.tokens).toEqual([]);
    });
  });

  describe('deriveKnownPurposes', () => {
    it('should filter canonical purposes', () => {
      const declared = ['train', 'cf:ai_crawler', 'search', 'unknown'];
      const known = deriveKnownPurposes(declared);
      expect(known).toEqual(['train', 'search']);
    });

    it('should return empty for no canonical purposes', () => {
      const declared = ['cf:ai_crawler', 'unknown', 'crawl'];
      const known = deriveKnownPurposes(declared);
      expect(known).toEqual([]);
    });

    it('should return all for all canonical', () => {
      const declared = ['train', 'search', 'user_action', 'inference', 'index'];
      const known = deriveKnownPurposes(declared);
      expect(known).toEqual(['train', 'search', 'user_action', 'inference', 'index']);
    });
  });
});

describe('Legacy Purpose Mapping', () => {
  describe('mapLegacyToCanonical', () => {
    it('should map crawl to index', () => {
      const result = mapLegacyToCanonical('crawl');
      expect(result.canonical).toBe('index');
      expect(result.mapping_note).toContain('crawl');
      expect(result.mapping_note).toContain('index');
    });

    it('should map ai_input to inference', () => {
      const result = mapLegacyToCanonical('ai_input');
      expect(result.canonical).toBe('inference');
    });

    it('should map ai_index to index', () => {
      const result = mapLegacyToCanonical('ai_index');
      expect(result.canonical).toBe('index');
    });
  });

  describe('normalizeToCanonicalOrPreserve', () => {
    it('should return canonical purpose unchanged', () => {
      const result = normalizeToCanonicalOrPreserve('train');
      expect(result.purpose).toBe('train');
      expect(result.mapped).toBe(false);
    });

    it('should map legacy purpose', () => {
      const result = normalizeToCanonicalOrPreserve('crawl');
      expect(result.purpose).toBe('index');
      expect(result.mapped).toBe(true);
      if (result.mapped) {
        expect(result.from).toBe('crawl');
      }
    });

    it('should preserve unknown purpose', () => {
      const result = normalizeToCanonicalOrPreserve('cf:ai_crawler');
      expect(result.purpose).toBe('cf:ai_crawler');
      expect(result.mapped).toBe(false);
      if (!result.mapped && 'unknown' in result) {
        expect(result.unknown).toBe(true);
      }
    });
  });
});

describe('Zod Validators', () => {
  describe('PurposeTokenSchema', () => {
    it('should accept valid tokens', () => {
      expect(() => PurposeTokenSchema.parse('train')).not.toThrow();
      expect(() => PurposeTokenSchema.parse('user_action')).not.toThrow();
      expect(() => PurposeTokenSchema.parse('cf:ai_crawler')).not.toThrow();
    });

    it('should reject invalid tokens', () => {
      expect(() => PurposeTokenSchema.parse('')).toThrow();
      expect(() => PurposeTokenSchema.parse('TRAIN')).toThrow();
      expect(() => PurposeTokenSchema.parse('train!')).toThrow();
    });
  });

  describe('CanonicalPurposeSchema', () => {
    it('should accept canonical purposes', () => {
      expect(() => CanonicalPurposeSchema.parse('train')).not.toThrow();
      expect(() => CanonicalPurposeSchema.parse('search')).not.toThrow();
      expect(() => CanonicalPurposeSchema.parse('user_action')).not.toThrow();
      expect(() => CanonicalPurposeSchema.parse('inference')).not.toThrow();
      expect(() => CanonicalPurposeSchema.parse('index')).not.toThrow();
    });

    it('should reject non-canonical purposes', () => {
      expect(() => CanonicalPurposeSchema.parse('crawl')).toThrow();
      expect(() => CanonicalPurposeSchema.parse('unknown')).toThrow();
    });
  });

  describe('PurposeReasonSchema', () => {
    it('should accept valid reasons', () => {
      expect(() => PurposeReasonSchema.parse('allowed')).not.toThrow();
      expect(() => PurposeReasonSchema.parse('denied')).not.toThrow();
      expect(() => PurposeReasonSchema.parse('undeclared_default')).not.toThrow();
    });

    it('should reject invalid reasons', () => {
      expect(() => PurposeReasonSchema.parse('invalid')).toThrow();
      expect(() => PurposeReasonSchema.parse('')).toThrow();
    });
  });
});
