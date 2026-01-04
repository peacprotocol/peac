/**
 * Hash Utilities Tests
 */
import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  computeExcerptHash,
  verifyContentHash,
  normalizeBase64url,
  base64urlEqual,
} from '../hash.js';
import type { ContentHash } from '@peac/schema';

describe('computeContentHash', () => {
  it('should compute SHA-256 hash of string content', () => {
    const hash = computeContentHash('test content');
    expect(hash.alg).toBe('sha-256');
    expect(hash.enc).toBe('base64url');
    expect(hash.value).toHaveLength(43); // Base64url of 32-byte hash
  });

  it('should compute consistent hash for same content', () => {
    const content = 'Hello, World!';
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    expect(hash1.value).toBe(hash2.value);
  });

  it('should compute different hashes for different content', () => {
    const hash1 = computeContentHash('content A');
    const hash2 = computeContentHash('content B');
    expect(hash1.value).not.toBe(hash2.value);
  });

  it('should handle empty string', () => {
    const hash = computeContentHash('');
    expect(hash.alg).toBe('sha-256');
    expect(hash.value).toHaveLength(43);
  });

  it('should handle Uint8Array input', () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = computeContentHash(content);
    expect(hash.alg).toBe('sha-256');
    expect(hash.value).toHaveLength(43);
  });

  it('should handle Unicode content', () => {
    const hash = computeContentHash('Hello, World! -- Привет, мир! -- 你好，世界！');
    expect(hash.alg).toBe('sha-256');
    expect(hash.value).toHaveLength(43);
  });
});

describe('computeExcerptHash', () => {
  it('should compute SHA-256 hash of excerpt', () => {
    const hash = computeExcerptHash('excerpt text');
    expect(hash.alg).toBe('sha-256');
    expect(hash.enc).toBe('base64url');
    expect(hash.value).toHaveLength(43);
  });

  it('should produce same result as computeContentHash for strings', () => {
    const text = 'some excerpt';
    const excerptHash = computeExcerptHash(text);
    const contentHash = computeContentHash(text);
    expect(excerptHash.value).toBe(contentHash.value);
  });
});

describe('verifyContentHash', () => {
  it('should return true for matching content', () => {
    const content = 'original content';
    const hash = computeContentHash(content);
    expect(verifyContentHash(content, hash)).toBe(true);
  });

  it('should return false for non-matching content', () => {
    const hash = computeContentHash('original');
    expect(verifyContentHash('different', hash)).toBe(false);
  });

  it('should return false for wrong algorithm', () => {
    // Double cast to test invalid input - runtime validation should reject
    const hash = {
      alg: 'sha-512',
      value: 'somehashvalue',
      enc: 'base64url',
    } as unknown as ContentHash;
    expect(verifyContentHash('test', hash)).toBe(false);
  });

  it('should return false for wrong encoding', () => {
    // Double cast to test invalid input - runtime validation should reject
    const hash = {
      alg: 'sha-256',
      value: 'somehashvalue',
      enc: 'hex',
    } as unknown as ContentHash;
    expect(verifyContentHash('test', hash)).toBe(false);
  });

  it('should work with Uint8Array content', () => {
    const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const hash = computeContentHash(content);
    expect(verifyContentHash(content, hash)).toBe(true);
    expect(verifyContentHash(new Uint8Array([1, 2, 3]), hash)).toBe(false);
  });

  it('should accept padded base64url input for interop', () => {
    const content = 'test content for padded input';
    const hash = computeContentHash(content);

    // Create padded version of the hash
    const paddedHash: ContentHash = {
      ...hash,
      value: hash.value + '==', // Add padding
    };

    // Should still verify correctly
    expect(verifyContentHash(content, paddedHash)).toBe(true);
  });

  it('should accept standard base64 alphabet for interop', () => {
    const content = 'test content for base64 interop';
    const hash = computeContentHash(content);

    // Convert base64url to standard base64 alphabet
    const base64Hash: ContentHash = {
      ...hash,
      value: hash.value.replace(/-/g, '+').replace(/_/g, '/'),
    };

    // Should still verify correctly
    expect(verifyContentHash(content, base64Hash)).toBe(true);
  });
});

describe('normalizeBase64url', () => {
  it('should return canonical input unchanged', () => {
    expect(normalizeBase64url('abc-_')).toBe('abc-_');
  });

  it('should remove padding', () => {
    expect(normalizeBase64url('abc-_=')).toBe('abc-_');
    expect(normalizeBase64url('abc-_==')).toBe('abc-_');
    expect(normalizeBase64url('abc==')).toBe('abc');
  });

  it('should convert standard base64 alphabet to base64url', () => {
    expect(normalizeBase64url('abc+/')).toBe('abc-_');
    expect(normalizeBase64url('a+b/c')).toBe('a-b_c');
  });

  it('should handle mixed padding and alphabet', () => {
    expect(normalizeBase64url('abc+/==')).toBe('abc-_');
    expect(normalizeBase64url('a+b/c=')).toBe('a-b_c');
  });

  it('should handle empty string', () => {
    expect(normalizeBase64url('')).toBe('');
  });

  it('should handle string with only padding', () => {
    expect(normalizeBase64url('===')).toBe('');
  });
});

describe('base64urlEqual', () => {
  it('should return true for identical canonical values', () => {
    expect(base64urlEqual('abc-_', 'abc-_')).toBe(true);
  });

  it('should return true for padded vs unpadded', () => {
    expect(base64urlEqual('abc-_', 'abc-_==')).toBe(true);
    expect(base64urlEqual('abc-_==', 'abc-_')).toBe(true);
  });

  it('should return true for base64 vs base64url alphabet', () => {
    expect(base64urlEqual('abc-_', 'abc+/')).toBe(true);
    expect(base64urlEqual('abc+/', 'abc-_')).toBe(true);
  });

  it('should return true for mixed encoding differences', () => {
    expect(base64urlEqual('abc+/==', 'abc-_')).toBe(true);
  });

  it('should return false for different values', () => {
    expect(base64urlEqual('abc', 'xyz')).toBe(false);
    expect(base64urlEqual('abc-_', 'abc-x')).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(base64urlEqual('', '')).toBe(true);
    expect(base64urlEqual('', '===')).toBe(true);
    expect(base64urlEqual('', 'abc')).toBe(false);
  });
});
