/**
 * Tests for RSL (Robots Specification Layer) mapping
 *
 * Golden vectors for RSL usage token to PEAC ControlPurpose mapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rslUsageTokensToControlPurposes,
  rslTokenToControlPurposes,
  controlPurposeToRslToken,
  isValidRslToken,
  getKnownRslTokens,
  parseRslTokenString,
} from '../src/index';

describe('RSL mapping', () => {
  describe('isValidRslToken', () => {
    it('should return true for known RSL 1.0 tokens', () => {
      expect(isValidRslToken('all')).toBe(true);
      expect(isValidRslToken('ai-all')).toBe(true);
      expect(isValidRslToken('ai-train')).toBe(true);
      expect(isValidRslToken('ai-input')).toBe(true);
      expect(isValidRslToken('ai-index')).toBe(true);
      expect(isValidRslToken('search')).toBe(true);
    });

    it('should return false for unknown tokens', () => {
      expect(isValidRslToken('unknown')).toBe(false);
      expect(isValidRslToken('ai-train-v2')).toBe(false);
      expect(isValidRslToken('')).toBe(false);
      expect(isValidRslToken('AI-TRAIN')).toBe(false); // case-sensitive
    });

    it('should return false for ai-search (not an RSL 1.0 token)', () => {
      // RSL 1.0 uses ai-index, not ai-search
      expect(isValidRslToken('ai-search')).toBe(false);
    });
  });

  describe('getKnownRslTokens', () => {
    it('should return all known RSL 1.0 tokens', () => {
      const tokens = getKnownRslTokens();
      expect(tokens).toContain('all');
      expect(tokens).toContain('ai-all');
      expect(tokens).toContain('ai-train');
      expect(tokens).toContain('ai-input');
      expect(tokens).toContain('ai-index');
      expect(tokens).toContain('search');
      expect(tokens).toHaveLength(6);
    });

    it('should NOT contain ai-search (not an RSL 1.0 token)', () => {
      const tokens = getKnownRslTokens();
      expect(tokens).not.toContain('ai-search');
    });
  });

  describe('rslTokenToControlPurposes', () => {
    it('should map ai-train to train', () => {
      const purposes = rslTokenToControlPurposes('ai-train');
      expect(purposes).toEqual(['train']);
    });

    it('should map ai-input to ai_input', () => {
      const purposes = rslTokenToControlPurposes('ai-input');
      expect(purposes).toEqual(['ai_input']);
    });

    it('should map ai-index to ai_index', () => {
      const purposes = rslTokenToControlPurposes('ai-index');
      expect(purposes).toEqual(['ai_index']);
    });

    it('should map search to search', () => {
      const purposes = rslTokenToControlPurposes('search');
      expect(purposes).toEqual(['search']);
    });

    it('should expand ai-all to train, ai_input, ai_index', () => {
      const purposes = rslTokenToControlPurposes('ai-all');
      expect(purposes).toEqual(['train', 'ai_input', 'ai_index']);
    });

    it('should expand all to train, ai_input, ai_index, search', () => {
      const purposes = rslTokenToControlPurposes('all');
      expect(purposes).toEqual(['train', 'ai_input', 'ai_index', 'search']);
    });

    it('should return empty array for unknown token', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const purposes = rslTokenToControlPurposes('unknown-token');
      expect(purposes).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith('[peac:rsl] Unknown RSL usage token: "unknown-token"');
      warnSpy.mockRestore();
    });
  });

  describe('rslUsageTokensToControlPurposes', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should map single token', () => {
      const result = rslUsageTokensToControlPurposes(['ai-train']);
      expect(result.purposes).toEqual(['train']);
      expect(result.unknownTokens).toEqual([]);
    });

    it('should map multiple tokens', () => {
      const result = rslUsageTokensToControlPurposes(['ai-train', 'ai-input']);
      expect(result.purposes).toContain('train');
      expect(result.purposes).toContain('ai_input');
      expect(result.purposes).toHaveLength(2);
      expect(result.unknownTokens).toEqual([]);
    });

    it('should deduplicate purposes', () => {
      const result = rslUsageTokensToControlPurposes(['ai-train', 'ai-train']);
      expect(result.purposes).toEqual(['train']);
    });

    it('should expand ai-all and deduplicate with individual tokens', () => {
      const result = rslUsageTokensToControlPurposes(['ai-all', 'ai-train']);
      expect(result.purposes).toContain('train');
      expect(result.purposes).toContain('ai_input');
      expect(result.purposes).toContain('ai_index');
      expect(result.purposes).toHaveLength(3);
    });

    it('should collect unknown tokens without throwing', () => {
      const result = rslUsageTokensToControlPurposes(['ai-train', 'unknown', 'also-unknown']);
      expect(result.purposes).toEqual(['train']);
      expect(result.unknownTokens).toEqual(['unknown', 'also-unknown']);
    });

    it('should handle empty array', () => {
      const result = rslUsageTokensToControlPurposes([]);
      expect(result.purposes).toEqual([]);
      expect(result.unknownTokens).toEqual([]);
    });
  });

  describe('controlPurposeToRslToken', () => {
    it('should map train back to ai-train', () => {
      expect(controlPurposeToRslToken('train')).toBe('ai-train');
    });

    it('should map ai_input back to ai-input', () => {
      expect(controlPurposeToRslToken('ai_input')).toBe('ai-input');
    });

    it('should map ai_index back to ai-index', () => {
      expect(controlPurposeToRslToken('ai_index')).toBe('ai-index');
    });

    it('should map search back to search', () => {
      expect(controlPurposeToRslToken('search')).toBe('search');
    });

    it('should return null for purposes without RSL equivalent', () => {
      expect(controlPurposeToRslToken('crawl')).toBeNull();
      expect(controlPurposeToRslToken('index')).toBeNull();
      expect(controlPurposeToRslToken('inference')).toBeNull();
    });
  });

  describe('parseRslTokenString', () => {
    it('should parse comma-separated tokens', () => {
      const rule = parseRslTokenString('ai-train, ai-input');
      expect(rule.tokens).toEqual(['ai-train', 'ai-input']);
      expect(rule.allow).toBe(true);
    });

    it('should handle single token', () => {
      const rule = parseRslTokenString('ai-train');
      expect(rule.tokens).toEqual(['ai-train']);
    });

    it('should trim whitespace', () => {
      const rule = parseRslTokenString('  ai-train  ,  ai-input  ');
      expect(rule.tokens).toEqual(['ai-train', 'ai-input']);
    });

    it('should lowercase tokens', () => {
      const rule = parseRslTokenString('AI-TRAIN, AI-INPUT');
      expect(rule.tokens).toEqual(['ai-train', 'ai-input']);
    });

    it('should handle empty string', () => {
      const rule = parseRslTokenString('');
      expect(rule.tokens).toEqual([]);
    });
  });

  describe('Golden Vectors', () => {
    /**
     * GOLDEN VECTOR A: Basic RSL to CAL mapping
     *
     * Verifies that standard RSL usage tokens map correctly
     * to PEAC ControlPurpose values.
     */
    describe('Golden Vector A: Basic RSL 1.0 to CAL mapping', () => {
      const vectors: Array<{
        name: string;
        input: string[];
        expectedPurposes: string[];
      }> = [
        {
          name: 'ai-train only',
          input: ['ai-train'],
          expectedPurposes: ['train'],
        },
        {
          name: 'ai-input only (RAG/grounding)',
          input: ['ai-input'],
          expectedPurposes: ['ai_input'],
        },
        {
          name: 'ai-index only (AI-powered search)',
          input: ['ai-index'],
          expectedPurposes: ['ai_index'],
        },
        {
          name: 'search only (traditional)',
          input: ['search'],
          expectedPurposes: ['search'],
        },
        {
          name: 'ai-all expands to AI purposes',
          input: ['ai-all'],
          expectedPurposes: ['train', 'ai_input', 'ai_index'],
        },
        {
          name: 'all expands to all purposes',
          input: ['all'],
          expectedPurposes: ['train', 'ai_input', 'ai_index', 'search'],
        },
        {
          name: 'combination: ai-train + ai-input',
          input: ['ai-train', 'ai-input'],
          expectedPurposes: ['train', 'ai_input'],
        },
        {
          name: 'combination: search + ai-index',
          input: ['search', 'ai-index'],
          expectedPurposes: ['search', 'ai_index'],
        },
        {
          name: 'all individual tokens',
          input: ['ai-train', 'ai-input', 'ai-index', 'search'],
          expectedPurposes: ['train', 'ai_input', 'ai_index', 'search'],
        },
      ];

      for (const vector of vectors) {
        it(`should map: ${vector.name}`, () => {
          const result = rslUsageTokensToControlPurposes(vector.input);
          expect(result.purposes.sort()).toEqual(vector.expectedPurposes.sort());
          expect(result.unknownTokens).toEqual([]);

          // Log golden vector
          console.log(
            `\n=== GOLDEN VECTOR: ${vector.name} ===\n` +
              `RSL Input: ${JSON.stringify(vector.input)}\n` +
              `CAL Output: ${JSON.stringify(result.purposes)}\n` +
              `===================================\n`
          );
        });
      }
    });

    /**
     * GOLDEN VECTOR B: Lenient handling of unknown tokens
     *
     * Verifies that unknown tokens are collected but don't
     * cause errors (lenient handling per P0.5 spec).
     */
    describe('Golden Vector B: Lenient unknown token handling', () => {
      beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('should collect unknown tokens without throwing', () => {
        const result = rslUsageTokensToControlPurposes([
          'ai-train',
          'future-token',
          'another-unknown',
        ]);

        expect(result.purposes).toEqual(['train']);
        expect(result.unknownTokens).toEqual(['future-token', 'another-unknown']);

        // Log golden vector
        console.log(
          '\n=== GOLDEN VECTOR: Unknown Token Handling ===\n' +
            `RSL Input: ${JSON.stringify(['ai-train', 'future-token', 'another-unknown'])}\n` +
            `CAL Output: ${JSON.stringify(result.purposes)}\n` +
            `Unknown: ${JSON.stringify(result.unknownTokens)}\n` +
            '=============================================\n'
        );
      });

      it('should handle all unknown tokens gracefully', () => {
        const result = rslUsageTokensToControlPurposes(['unknown1', 'unknown2']);

        expect(result.purposes).toEqual([]);
        expect(result.unknownTokens).toEqual(['unknown1', 'unknown2']);
      });
    });

    /**
     * GOLDEN VECTOR C: Round-trip mapping
     *
     * Verifies that CAL purposes with RSL equivalents can
     * be mapped back to RSL tokens.
     */
    describe('Golden Vector C: Round-trip mapping', () => {
      const roundTripVectors = [
        { purpose: 'train', rslToken: 'ai-train' },
        { purpose: 'ai_input', rslToken: 'ai-input' },
        { purpose: 'ai_index', rslToken: 'ai-index' },
        { purpose: 'search', rslToken: 'search' },
      ] as const;

      for (const vector of roundTripVectors) {
        it(`should round-trip: ${vector.purpose} <-> ${vector.rslToken}`, () => {
          // RSL -> CAL
          const purposes = rslTokenToControlPurposes(vector.rslToken);
          expect(purposes).toContain(vector.purpose);

          // CAL -> RSL
          const token = controlPurposeToRslToken(vector.purpose);
          expect(token).toBe(vector.rslToken);

          // Log golden vector
          console.log(
            `\n=== GOLDEN VECTOR: Round-trip ${vector.purpose} ===\n` +
              `RSL "${vector.rslToken}" -> CAL ${JSON.stringify(purposes)}\n` +
              `CAL "${vector.purpose}" -> RSL "${token}"\n` +
              '===============================================\n'
          );
        });
      }
    });

    /**
     * GOLDEN VECTOR D: RSL 1.0 Token Vocabulary Parity
     *
     * Ensures our RSL token vocabulary exactly matches RSL 1.0 specification.
     * @see https://rslstandard.org/rsl for canonical RSL 1.0 specification
     *
     * RSL 1.0 canonical tokens: all, ai-all, ai-train, ai-input, ai-index, search
     * NOT in RSL 1.0: ai-search (this was a misunderstanding in earlier versions)
     */
    describe('Golden Vector D: RSL 1.0 Token Vocabulary Parity', () => {
      const RSL_1_0_CANONICAL_TOKENS = [
        'all',
        'ai-all',
        'ai-train',
        'ai-input',
        'ai-index',
        'search',
      ];

      it('should have exactly the RSL 1.0 canonical token set', () => {
        const tokens = getKnownRslTokens();
        expect(tokens.sort()).toEqual(RSL_1_0_CANONICAL_TOKENS.sort());
      });

      it('should NOT include ai-search (not in RSL 1.0)', () => {
        const tokens = getKnownRslTokens();
        expect(tokens).not.toContain('ai-search');
        expect(isValidRslToken('ai-search')).toBe(false);
      });

      it('should validate all RSL 1.0 tokens', () => {
        for (const token of RSL_1_0_CANONICAL_TOKENS) {
          expect(isValidRslToken(token)).toBe(true);
        }
      });

      it('should reject common non-RSL tokens', () => {
        const nonRslTokens = [
          'ai-search', // Common mistake - RSL uses ai-index
          'crawl', // PEAC-only, no RSL equivalent
          'index', // PEAC-only, no RSL equivalent
          'inference', // PEAC-only, no RSL equivalent
          'train', // Must use ai-train in RSL
        ];

        for (const token of nonRslTokens) {
          expect(isValidRslToken(token)).toBe(false);
        }
      });
    });
  });
});
