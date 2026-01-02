/**
 * AIPREF Mapping Tests
 */
import { describe, it, expect } from 'vitest';
import {
  // Constants
  AIPREF_STANDARD_KEYS,
  AIPREF_EXTENSION_KEYS,
  AIPREF_KNOWN_KEYS,
  // Type guards
  isAiprefStandardKey,
  isAiprefExtensionKey,
  isAiprefKnownKey,
  // Mapping functions
  aiprefKeyToCanonicalPurpose,
  canonicalPurposeToAiprefKey,
  mapAiprefKeys,
  // Header parsing
  parseContentUsageHeader,
  contentUsageToCanonicalPurposes,
  canonicalPurposesToContentUsage,
} from '../src/index';

describe('AIPREF Mapping Constants', () => {
  it('should have correct standard keys', () => {
    expect(AIPREF_STANDARD_KEYS).toEqual(['train-ai', 'search']);
  });

  it('should have correct extension keys', () => {
    expect(AIPREF_EXTENSION_KEYS).toEqual(['train-genai', 'ai']);
  });

  it('should have all known keys', () => {
    expect(AIPREF_KNOWN_KEYS).toEqual(['train-ai', 'search', 'train-genai', 'ai']);
  });
});

describe('AIPREF Type Guards', () => {
  describe('isAiprefStandardKey', () => {
    it('should return true for standard keys', () => {
      expect(isAiprefStandardKey('train-ai')).toBe(true);
      expect(isAiprefStandardKey('search')).toBe(true);
    });

    it('should return false for extension keys', () => {
      expect(isAiprefStandardKey('train-genai')).toBe(false);
      expect(isAiprefStandardKey('ai')).toBe(false);
    });

    it('should return false for unknown keys', () => {
      expect(isAiprefStandardKey('custom')).toBe(false);
      expect(isAiprefStandardKey('unknown')).toBe(false);
    });
  });

  describe('isAiprefExtensionKey', () => {
    it('should return true for extension keys', () => {
      expect(isAiprefExtensionKey('train-genai')).toBe(true);
      expect(isAiprefExtensionKey('ai')).toBe(true);
    });

    it('should return false for standard keys', () => {
      expect(isAiprefExtensionKey('train-ai')).toBe(false);
      expect(isAiprefExtensionKey('search')).toBe(false);
    });

    it('should return false for unknown keys', () => {
      expect(isAiprefExtensionKey('custom')).toBe(false);
    });
  });

  describe('isAiprefKnownKey', () => {
    it('should return true for all known keys', () => {
      expect(isAiprefKnownKey('train-ai')).toBe(true);
      expect(isAiprefKnownKey('search')).toBe(true);
      expect(isAiprefKnownKey('train-genai')).toBe(true);
      expect(isAiprefKnownKey('ai')).toBe(true);
    });

    it('should return false for unknown keys', () => {
      expect(isAiprefKnownKey('custom')).toBe(false);
      expect(isAiprefKnownKey('unknown')).toBe(false);
    });
  });
});

describe('aiprefKeyToCanonicalPurpose', () => {
  describe('standard keys', () => {
    it('should map train-ai to train', () => {
      const result = aiprefKeyToCanonicalPurpose('train-ai');
      expect(result.canonical).toBe('train');
      expect(result.preserved).toBe('train-ai');
      expect(result.mapping_note).toBeUndefined();
    });

    it('should map search to search', () => {
      const result = aiprefKeyToCanonicalPurpose('search');
      expect(result.canonical).toBe('search');
      expect(result.preserved).toBe('search');
      expect(result.mapping_note).toBeUndefined();
    });
  });

  describe('extension keys', () => {
    it('should map train-genai to train with note', () => {
      const result = aiprefKeyToCanonicalPurpose('train-genai');
      expect(result.canonical).toBe('train');
      expect(result.preserved).toBe('train-genai');
      expect(result.mapping_note).toContain('Extension key');
    });

    it('should map ai to train with note', () => {
      const result = aiprefKeyToCanonicalPurpose('ai');
      expect(result.canonical).toBe('train');
      expect(result.preserved).toBe('ai');
      expect(result.mapping_note).toContain('Legacy key');
    });
  });

  describe('unknown keys', () => {
    it('should preserve unknown keys with null canonical', () => {
      const result = aiprefKeyToCanonicalPurpose('custom-key');
      expect(result.canonical).toBeNull();
      expect(result.preserved).toBe('custom-key');
      expect(result.mapping_note).toContain('Unknown');
    });

    it('should normalize keys to lowercase', () => {
      const result = aiprefKeyToCanonicalPurpose('TRAIN-AI');
      expect(result.canonical).toBe('train');
      expect(result.preserved).toBe('train-ai');
    });

    it('should trim whitespace', () => {
      const result = aiprefKeyToCanonicalPurpose('  search  ');
      expect(result.canonical).toBe('search');
      expect(result.preserved).toBe('search');
    });
  });
});

describe('canonicalPurposeToAiprefKey', () => {
  it('should map train to train-ai', () => {
    expect(canonicalPurposeToAiprefKey('train')).toBe('train-ai');
  });

  it('should map search to search', () => {
    expect(canonicalPurposeToAiprefKey('search')).toBe('search');
  });

  it('should return null for purposes without AIPREF equivalent', () => {
    expect(canonicalPurposeToAiprefKey('user_action')).toBeNull();
    expect(canonicalPurposeToAiprefKey('inference')).toBeNull();
    expect(canonicalPurposeToAiprefKey('index')).toBeNull();
  });
});

describe('mapAiprefKeys', () => {
  it('should map multiple known keys', () => {
    const result = mapAiprefKeys(['train-ai', 'search']);
    expect(result.purposes).toContain('train');
    expect(result.purposes).toContain('search');
    expect(result.preserved).toEqual(['train-ai', 'search']);
    expect(result.unknown).toEqual([]);
  });

  it('should track unknown keys', () => {
    const result = mapAiprefKeys(['train-ai', 'custom-key']);
    expect(result.purposes).toEqual(['train']);
    expect(result.preserved).toEqual(['train-ai', 'custom-key']);
    expect(result.unknown).toContain('custom-key');
    expect(result.notes).toContainEqual(expect.stringContaining('Unknown'));
  });

  it('should dedupe purposes', () => {
    const result = mapAiprefKeys(['train-ai', 'train-genai', 'ai']);
    expect(result.purposes).toEqual(['train']); // All map to train
    expect(result.preserved).toEqual(['train-ai', 'train-genai', 'ai']);
  });

  it('should handle empty array', () => {
    const result = mapAiprefKeys([]);
    expect(result.purposes).toEqual([]);
    expect(result.preserved).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});

describe('Content-Usage Header Parsing', () => {
  describe('parseContentUsageHeader', () => {
    it('should parse RFC 8941 boolean format', () => {
      const result = parseContentUsageHeader('train-ai=?1, search=?0');
      expect(result.valid).toBe(true);
      expect(result.entries.get('train-ai')).toBe(true);
      expect(result.entries.get('search')).toBe(false);
    });

    it('should parse simple true/false values', () => {
      const result = parseContentUsageHeader('train-ai=true, search=false');
      expect(result.valid).toBe(true);
      expect(result.entries.get('train-ai')).toBe(true);
      expect(result.entries.get('search')).toBe(false);
    });

    it('should parse y/n values', () => {
      const result = parseContentUsageHeader('train-ai=y, search=n');
      expect(result.valid).toBe(true);
      expect(result.entries.get('train-ai')).toBe(true);
      expect(result.entries.get('search')).toBe(false);
    });

    it('should parse yes/no values', () => {
      const result = parseContentUsageHeader('train-ai=yes, search=no');
      expect(result.valid).toBe(true);
      expect(result.entries.get('train-ai')).toBe(true);
      expect(result.entries.get('search')).toBe(false);
    });

    it('should treat key without value as true', () => {
      const result = parseContentUsageHeader('train-ai, search');
      expect(result.valid).toBe(true);
      expect(result.entries.get('train-ai')).toBe(true);
      expect(result.entries.get('search')).toBe(true);
    });

    it('should normalize keys to lowercase', () => {
      const result = parseContentUsageHeader('TRAIN-AI=?1');
      expect(result.entries.get('train-ai')).toBe(true);
    });

    it('should handle empty header', () => {
      const result = parseContentUsageHeader('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle null/undefined', () => {
      const result = parseContentUsageHeader(null as unknown as string);
      expect(result.valid).toBe(false);
    });
  });

  describe('contentUsageToCanonicalPurposes', () => {
    it('should convert allowed purposes', () => {
      const result = contentUsageToCanonicalPurposes('train-ai=?1, search=?1');
      expect(result.purposes).toContain('train');
      expect(result.purposes).toContain('search');
    });

    it('should exclude denied purposes', () => {
      const result = contentUsageToCanonicalPurposes('train-ai=?1, search=?0');
      expect(result.purposes).toEqual(['train']);
      expect(result.preserved).toContain('train-ai');
      // search=?0 means not allowed, so not in preserved for purposes
    });

    it('should track unknown keys', () => {
      const result = contentUsageToCanonicalPurposes('train-ai=?1, custom=?1');
      expect(result.purposes).toEqual(['train']);
      expect(result.unknown).toContain('custom');
    });

    it('should handle parse errors', () => {
      const result = contentUsageToCanonicalPurposes('');
      expect(result.purposes).toEqual([]);
      expect(result.notes).toContainEqual(expect.stringContaining('invalid'));
    });
  });

  describe('canonicalPurposesToContentUsage', () => {
    it('should generate header for allowed purposes', () => {
      const header = canonicalPurposesToContentUsage(['train', 'search']);
      expect(header).toContain('train-ai=?1');
      expect(header).toContain('search=?1');
    });

    it('should skip purposes without AIPREF equivalent', () => {
      const header = canonicalPurposesToContentUsage(['train', 'index']);
      expect(header).toBe('train-ai=?1');
    });

    it('should include explicit denials from defaults', () => {
      const header = canonicalPurposesToContentUsage(['train'], { search: false });
      expect(header).toContain('train-ai=?1');
      expect(header).toContain('search=?0');
    });

    it('should handle empty array', () => {
      const header = canonicalPurposesToContentUsage([]);
      expect(header).toBe('');
    });
  });
});

describe('Round-trip Mapping', () => {
  it('should round-trip standard keys', () => {
    const original = ['train-ai', 'search'];
    const batch = mapAiprefKeys(original);
    const backToAipref = batch.purposes
      .map(canonicalPurposeToAiprefKey)
      .filter((k): k is NonNullable<typeof k> => k !== null);

    expect(backToAipref.sort()).toEqual(original.sort());
  });

  it('should preserve unknown keys in batch mapping', () => {
    const original = ['train-ai', 'custom-key', 'another-custom'];
    const batch = mapAiprefKeys(original);

    expect(batch.preserved).toEqual(original.map((k) => k.toLowerCase()));
    expect(batch.unknown).toEqual(['custom-key', 'another-custom']);
  });
});
