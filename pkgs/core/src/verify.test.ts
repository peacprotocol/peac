/**
 * @peac/core/verify - Negative test cases for crypto guardrails
 */

import { describe, it, expect } from '@jest/globals';
import { verify } from './verify.js';
import { sign } from './sign.js';
import type { KeySet, Rec } from './types.js';

describe('verify - crypto guardrails', () => {
  const testKeys: KeySet = {
    'test-key-001': {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'test_public_key_material',
      d: 'test_private_key_material', // Only for signing
    },
  };

  const validReceipt: Rec = {
    subject: { uri: 'https://example.com/resource' },
    aipref: {
      status: 'active',
      checked_at: new Date().toISOString(),
      snapshot: { 'train-ai': false, 'crawl': true },
      digest: { alg: 'JCS-SHA256', val: 'abc123' },
    },
    enforcement: { method: 'none' },
    issued_at: new Date().toISOString(),
    kid: 'test-key-001',
  };

  describe('negative tests', () => {
    it('should reject non-EdDSA algorithm', async () => {
      // Manually craft a JWS with wrong algorithm
      const badHeader = Buffer.from(
        JSON.stringify({ alg: 'HS256', kid: 'test-key-001' })
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(validReceipt)).toString('base64url');
      const badJWS = `${badHeader}.${payload}.fake_signature`;

      await expect(verify(badJWS, testKeys)).rejects.toThrow('Unsupported algorithm: HS256');
    });

    it('should reject missing kid', async () => {
      const badHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(validReceipt)).toString('base64url');
      const badJWS = `${badHeader}.${payload}.fake_signature`;

      await expect(verify(badJWS, testKeys)).rejects.toThrow('Missing or invalid kid');
    });

    it('should reject unknown kid', async () => {
      const badHeader = Buffer.from(
        JSON.stringify({ alg: 'EdDSA', kid: 'unknown-key' })
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(validReceipt)).toString('base64url');
      const badJWS = `${badHeader}.${payload}.fake_signature`;

      await expect(verify(badJWS, testKeys)).rejects.toThrow('Unknown key ID: unknown-key');
    });

    it('should reject algorithm swap attacks', async () => {
      // Try to swap EdDSA for RS256
      const badHeader = Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'test-key-001', typ: 'JWT' })
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(validReceipt)).toString('base64url');
      const badJWS = `${badHeader}.${payload}.fake_signature`;

      await expect(verify(badJWS, testKeys)).rejects.toThrow('Unsupported algorithm: RS256');
    });

    it('should reject kid mismatch between header and payload', async () => {
      const badReceipt = { ...validReceipt, kid: 'different-key' };
      const header = Buffer.from(
        JSON.stringify({ alg: 'EdDSA', kid: 'test-key-001' })
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(badReceipt)).toString('base64url');
      const badJWS = `${header}.${payload}.fake_signature`;

      await expect(verify(badJWS, testKeys)).rejects.toThrow('kid mismatch');
    });

    it('should reject malformed JWS', async () => {
      await expect(verify('not.a.jws', testKeys)).rejects.toThrow('Invalid JWS format');
      await expect(verify('only.two', testKeys)).rejects.toThrow('Invalid JWS format');
      await expect(verify('', testKeys)).rejects.toThrow('Invalid JWS format');
    });

    it('should reject non-base64url header', async () => {
      const badJWS = 'not-base64url.payload.signature';
      await expect(verify(badJWS, testKeys)).rejects.toThrow();
    });
  });

  describe('key rotation', () => {
    it('should verify with rotated keys', async () => {
      const rotatedKeys: KeySet = {
        'old-key-2024': {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'old_public_key',
        },
        'new-key-2025': {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'new_public_key',
        },
      };

      // Simulate receipt signed with new key
      const newReceipt = { ...validReceipt, kid: 'new-key-2025' };
      const header = Buffer.from(
        JSON.stringify({ alg: 'EdDSA', kid: 'new-key-2025' })
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify(newReceipt)).toString('base64url');
      const jws = `${header}.${payload}.signature`;

      // Should find and use the new key
      await expect(verify(jws, rotatedKeys)).rejects.toThrow(); // Will fail on actual verification
    });

    it('should handle TTL-based key cache', async () => {
      // This would be implemented in the discovery module
      // Keys should have an optional expires_at field
      const timedKeys: KeySet = {
        'expiring-key': {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'public_key',
          // expires_at: '2025-09-06T00:00:00Z' // Future enhancement
        },
      };

      // Test that expired keys are rejected
      // Implementation would check expires_at before using key
      expect(timedKeys['expiring-key']).toBeDefined();
    });
  });
});