/**
 * Hash utilities tests
 *
 * Tests for SHA-256 hashing with platform fallback behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sha256Hex,
  sha256Bytes,
  hexToBytes,
  bytesToHex,
  computeJwkThumbprint,
  jwkToPublicKeyBytes,
} from '../src/hash.js';

describe('Hash Utilities', () => {
  describe('sha256Hex', () => {
    it('should hash a string correctly', async () => {
      const result = await sha256Hex('hello');
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should hash Uint8Array correctly', async () => {
      const bytes = new TextEncoder().encode('hello');
      const result = await sha256Hex(bytes);
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should produce 64 character lowercase hex', async () => {
      const result = await sha256Hex('test');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should hash empty string', async () => {
      const result = await sha256Hex('');
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('sha256Bytes', () => {
    it('should return 32 bytes', async () => {
      const result = await sha256Bytes('hello');
      expect(result.length).toBe(32);
    });

    it('should match hex output', async () => {
      const hex = await sha256Hex('hello');
      const bytes = await sha256Bytes('hello');
      expect(bytesToHex(bytes)).toBe(hex);
    });
  });

  describe('hexToBytes and bytesToHex', () => {
    it('should round-trip correctly', () => {
      const original = new Uint8Array([0x00, 0x11, 0x22, 0xff]);
      const hex = bytesToHex(original);
      const roundTrip = hexToBytes(hex);
      expect(roundTrip).toEqual(original);
    });

    it('should handle empty input for bytesToHex', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('');
    });

    it('should handle empty string for hexToBytes', () => {
      const result = hexToBytes('');
      expect(result).toEqual(new Uint8Array([]));
    });

    it('should throw on invalid hex characters', () => {
      expect(() => hexToBytes('xyz')).toThrow('Invalid hex string');
    });

    it('should throw on odd-length hex string', () => {
      expect(() => hexToBytes('abc')).toThrow('Invalid hex string');
    });

    it('should throw on 0x prefix (not valid hex per our spec)', () => {
      expect(() => hexToBytes('0x1234')).toThrow('Invalid hex string');
    });

    it('should accept mixed case (a-f and A-F)', () => {
      // Mixed case is valid hex
      const result = hexToBytes('aAbBcCdDeEfF');
      expect(result).toEqual(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]));
    });

    it('should throw on whitespace', () => {
      expect(() => hexToBytes('aa bb')).toThrow('Invalid hex string');
    });

    it('should throw on special characters', () => {
      expect(() => hexToBytes('aa-bb')).toThrow('Invalid hex string');
    });
  });

  describe('computeJwkThumbprint', () => {
    it('should compute RFC 7638 thumbprint for Ed25519 key', async () => {
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
      };
      const thumbprint = await computeJwkThumbprint(jwk);
      // Thumbprint should be base64url encoded SHA-256 (43 chars without padding)
      expect(thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('should reject non-Ed25519 keys', async () => {
      const jwk = {
        kty: 'EC',
        crv: 'P-256',
        x: 'test',
      };
      await expect(computeJwkThumbprint(jwk)).rejects.toThrow('Only Ed25519');
    });

    it('should produce consistent thumbprints', async () => {
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'test_key_value_here_32_bytes_ba',
      };
      const t1 = await computeJwkThumbprint(jwk);
      const t2 = await computeJwkThumbprint(jwk);
      expect(t1).toBe(t2);
    });
  });

  describe('jwkToPublicKeyBytes', () => {
    it('should extract 32-byte public key', () => {
      // Base64url encoding of 32 zero bytes
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      };
      const bytes = jwkToPublicKeyBytes(jwk);
      expect(bytes.length).toBe(32);
    });

    it('should reject non-Ed25519 keys', () => {
      const jwk = {
        kty: 'EC',
        crv: 'P-256',
        x: 'test',
      };
      expect(() => jwkToPublicKeyBytes(jwk)).toThrow('Only Ed25519');
    });

    it('should reject wrong-size keys', () => {
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'dG9vLXNob3J0', // 'too-short' base64url, only 9 bytes
      };
      expect(() => jwkToPublicKeyBytes(jwk)).toThrow('32 bytes');
    });
  });

  describe('Node.js fallback behavior', () => {
    // Store original crypto for restoration
    let originalCrypto: typeof globalThis.crypto | undefined;

    beforeEach(() => {
      originalCrypto = globalThis.crypto;
    });

    afterEach(() => {
      // Restore original crypto
      if (originalCrypto) {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should work when WebCrypto is unavailable (Node.js fallback)', async () => {
      // Temporarily remove WebCrypto to force Node.js fallback
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // This should still work via Node.js crypto fallback
      const result = await sha256Hex('hello');
      expect(result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should work when WebCrypto.subtle is unavailable', async () => {
      // Partially available crypto (no subtle)
      Object.defineProperty(globalThis, 'crypto', {
        value: { getRandomValues: () => {} },
        writable: true,
        configurable: true,
      });

      const result = await sha256Hex('test');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
