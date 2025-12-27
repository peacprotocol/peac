import { describe, it, expect } from 'vitest';
import { hashIdentifier, hashUrl, hashEmail, hashIp } from '../src/hash.js';

describe('privacy-preserving hashing', () => {
  describe('hashIdentifier', () => {
    it('should hash a value using sha256 by default', () => {
      const result = hashIdentifier('test-value');
      expect(result.algorithm).toBe('sha256');
      expect(result.hash).toHaveLength(64); // sha256 hex = 64 chars
      expect(result.salted).toBe(false);
    });

    it('should produce consistent hashes', () => {
      const result1 = hashIdentifier('same-value');
      const result2 = hashIdentifier('same-value');
      expect(result1.hash).toBe(result2.hash);
    });

    it('should produce different hashes for different values', () => {
      const result1 = hashIdentifier('value1');
      const result2 = hashIdentifier('value2');
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should apply salt when provided', () => {
      const unsalted = hashIdentifier('test-value');
      const salted = hashIdentifier('test-value', { salt: 'my-secret-salt' });

      expect(salted.salted).toBe(true);
      expect(salted.hash).not.toBe(unsalted.hash);
    });

    it('should use different algorithms when specified', () => {
      const sha256 = hashIdentifier('test', { algorithm: 'sha256' });
      const sha384 = hashIdentifier('test', { algorithm: 'sha384' });
      const sha512 = hashIdentifier('test', { algorithm: 'sha512' });

      expect(sha256.algorithm).toBe('sha256');
      expect(sha384.algorithm).toBe('sha384');
      expect(sha512.algorithm).toBe('sha512');

      expect(sha256.hash).toHaveLength(64);
      expect(sha384.hash).toHaveLength(96);
      expect(sha512.hash).toHaveLength(128);
    });
  });

  describe('hashUrl', () => {
    it('should normalize URL before hashing', () => {
      const result1 = hashUrl('https://example.com/path');
      const result2 = hashUrl('HTTPS://EXAMPLE.COM/PATH');
      const result3 = hashUrl('  https://example.com/path  ');

      // All should produce the same hash after normalization
      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash).toBe(result3.hash);
    });

    it('should hash URLs with salt', () => {
      const unsalted = hashUrl('https://example.com');
      const salted = hashUrl('https://example.com', { salt: 'url-salt' });

      expect(unsalted.hash).not.toBe(salted.hash);
      expect(salted.salted).toBe(true);
    });
  });

  describe('hashEmail', () => {
    it('should normalize email before hashing', () => {
      const result1 = hashEmail('user@example.com');
      const result2 = hashEmail('USER@EXAMPLE.COM');
      const result3 = hashEmail('  user@example.com  ');

      expect(result1.hash).toBe(result2.hash);
      expect(result1.hash).toBe(result3.hash);
    });

    it('should hash emails with salt', () => {
      const unsalted = hashEmail('user@example.com');
      const salted = hashEmail('user@example.com', { salt: 'email-salt' });

      expect(unsalted.hash).not.toBe(salted.hash);
    });
  });

  describe('hashIp', () => {
    it('should hash IP addresses', () => {
      const result = hashIp('192.168.1.1');
      expect(result.hash).toHaveLength(64);
      expect(result.algorithm).toBe('sha256');
    });

    it('should produce consistent hashes for same IP', () => {
      const result1 = hashIp('10.0.0.1');
      const result2 = hashIp('10.0.0.1');
      expect(result1.hash).toBe(result2.hash);
    });

    it('should handle IPv6 addresses', () => {
      const result = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(result.hash).toHaveLength(64);
    });

    it('should hash IPs with salt for additional privacy', () => {
      const unsalted = hashIp('192.168.1.1');
      const salted = hashIp('192.168.1.1', { salt: 'ip-salt' });

      expect(unsalted.hash).not.toBe(salted.hash);
    });
  });
});
