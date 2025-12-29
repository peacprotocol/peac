import { describe, it, expect } from 'vitest';
import { hashIdentifier, hashUrl, hashEmail, hashIp } from '../src/hash.js';

const TEST_SALT = 'test-salt-for-unit-tests';

describe('privacy-preserving hashing', () => {
  describe('hashIdentifier', () => {
    it('should require salt by default', () => {
      expect(() => hashIdentifier('test-value')).toThrow(
        'Salt is required for privacy-preserving hashing'
      );
    });

    it('should allow unsalted hashing with explicit unsafe flag', () => {
      const result = hashIdentifier('test-value', { unsafeAllowUnsalted: true });
      expect(result.algorithm).toBe('sha256');
      expect(result.hash).toHaveLength(64);
      expect(result.salted).toBe(false);
    });

    it('should hash a value using sha256 by default', () => {
      const result = hashIdentifier('test-value', { salt: TEST_SALT });
      expect(result.algorithm).toBe('sha256');
      expect(result.hash).toHaveLength(64); // sha256 hex = 64 chars
      expect(result.salted).toBe(true);
    });

    it('should produce consistent hashes with same salt', () => {
      const result1 = hashIdentifier('same-value', { salt: TEST_SALT });
      const result2 = hashIdentifier('same-value', { salt: TEST_SALT });
      expect(result1.hash).toBe(result2.hash);
    });

    it('should produce different hashes for different values', () => {
      const result1 = hashIdentifier('value1', { salt: TEST_SALT });
      const result2 = hashIdentifier('value2', { salt: TEST_SALT });
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should produce different hashes with different salts', () => {
      const result1 = hashIdentifier('test-value', { salt: 'salt-one' });
      const result2 = hashIdentifier('test-value', { salt: 'salt-two' });
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should produce different hashes when salted vs unsalted', () => {
      const unsalted = hashIdentifier('test-value', { unsafeAllowUnsalted: true });
      const salted = hashIdentifier('test-value', { salt: 'my-secret-salt' });

      expect(salted.salted).toBe(true);
      expect(unsalted.salted).toBe(false);
      expect(salted.hash).not.toBe(unsalted.hash);
    });

    it('should use different algorithms when specified', () => {
      const sha256 = hashIdentifier('test', { salt: TEST_SALT, algorithm: 'sha256' });
      const sha384 = hashIdentifier('test', { salt: TEST_SALT, algorithm: 'sha384' });
      const sha512 = hashIdentifier('test', { salt: TEST_SALT, algorithm: 'sha512' });

      expect(sha256.algorithm).toBe('sha256');
      expect(sha384.algorithm).toBe('sha384');
      expect(sha512.algorithm).toBe('sha512');

      expect(sha256.hash).toHaveLength(64);
      expect(sha384.hash).toHaveLength(96);
      expect(sha512.hash).toHaveLength(128);
    });
  });

  describe('hashUrl', () => {
    it('should require salt by default', () => {
      expect(() => hashUrl('https://example.com')).toThrow(
        'Salt is required for privacy-preserving hashing'
      );
    });

    it('should normalize URL before hashing', () => {
      const result1 = hashUrl('https://example.com/path', { salt: TEST_SALT });
      const result2 = hashUrl('HTTPS://EXAMPLE.COM/PATH', { salt: TEST_SALT });
      const result3 = hashUrl('  https://example.com/path  ', { salt: TEST_SALT });

      // All should produce the same hash after normalization
      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash).toBe(result3.hash);
    });

    it('should hash URLs with salt', () => {
      const result = hashUrl('https://example.com', { salt: 'url-salt' });
      expect(result.salted).toBe(true);
      expect(result.hash).toHaveLength(64);
    });
  });

  describe('hashEmail', () => {
    it('should require salt by default', () => {
      expect(() => hashEmail('user@example.com')).toThrow(
        'Salt is required for privacy-preserving hashing'
      );
    });

    it('should normalize email before hashing', () => {
      const result1 = hashEmail('user@example.com', { salt: TEST_SALT });
      const result2 = hashEmail('USER@EXAMPLE.COM', { salt: TEST_SALT });
      const result3 = hashEmail('  user@example.com  ', { salt: TEST_SALT });

      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash).toBe(result3.hash);
    });

    it('should hash emails with salt', () => {
      const result = hashEmail('user@example.com', { salt: 'email-salt' });
      expect(result.salted).toBe(true);
      expect(result.hash).toHaveLength(64);
    });
  });

  describe('hashIp', () => {
    it('should require salt by default', () => {
      expect(() => hashIp('192.168.1.1')).toThrow(
        'Salt is required for privacy-preserving hashing'
      );
    });

    it('should hash IP addresses with salt', () => {
      const result = hashIp('192.168.1.1', { salt: TEST_SALT });
      expect(result.hash).toHaveLength(64);
      expect(result.algorithm).toBe('sha256');
      expect(result.salted).toBe(true);
    });

    it('should produce consistent hashes for same IP with same salt', () => {
      const result1 = hashIp('10.0.0.1', { salt: TEST_SALT });
      const result2 = hashIp('10.0.0.1', { salt: TEST_SALT });
      expect(result1.hash).toBe(result2.hash);
    });

    it('should handle IPv6 addresses', () => {
      const result = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334', { salt: TEST_SALT });
      expect(result.hash).toHaveLength(64);
      expect(result.salted).toBe(true);
    });

    it('should produce different hashes with different salts', () => {
      const result1 = hashIp('192.168.1.1', { salt: 'salt-one' });
      const result2 = hashIp('192.168.1.1', { salt: 'salt-two' });
      expect(result1.hash).not.toBe(result2.hash);
    });
  });
});
