/**
 * Key resolution tests
 *
 * Tests the key stability hierarchy: env -> local file -> ephemeral.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveKeys, getPublicJwk, resetKeyCache } from '../src/keys.js';
import { base64urlEncode, generateKeypair } from '@peac/crypto';

describe('Key resolution', () => {
  const originalEnv = process.env.PEAC_SANDBOX_PRIVATE_JWK;

  beforeEach(() => {
    resetKeyCache();
    delete process.env.PEAC_SANDBOX_PRIVATE_JWK;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PEAC_SANDBOX_PRIVATE_JWK = originalEnv;
    } else {
      delete process.env.PEAC_SANDBOX_PRIVATE_JWK;
    }
  });

  it('should load keys from env when PEAC_SANDBOX_PRIVATE_JWK is set', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: base64urlEncode(privateKey),
      x: base64urlEncode(publicKey),
      kid: 'test-env-key',
    };
    process.env.PEAC_SANDBOX_PRIVATE_JWK = JSON.stringify(jwk);

    const keys = await resolveKeys();
    expect(keys.mode).toBe('env');
    expect(keys.kid).toBe('test-env-key');
    expect(keys.privateKey).toEqual(privateKey);
    expect(keys.publicKey).toEqual(publicKey);
  });

  it('should generate a kid in sandbox-YYYY-MM format when env has no kid', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: base64urlEncode(privateKey),
      x: base64urlEncode(publicKey),
    };
    process.env.PEAC_SANDBOX_PRIVATE_JWK = JSON.stringify(jwk);

    const keys = await resolveKeys();
    expect(keys.kid).toMatch(/^sandbox-\d{4}-\d{2}$/);
  });

  it('should skip invalid env JSON', async () => {
    process.env.PEAC_SANDBOX_PRIVATE_JWK = 'not-json';

    const keys = await resolveKeys();
    // Should fall through (env parse fails)
    expect(keys.mode).not.toBe('env');
  });

  it('should cache keys across calls', async () => {
    const keys1 = await resolveKeys();
    const keys2 = await resolveKeys();
    expect(keys1).toBe(keys2); // Same reference
  });

  it('should return fresh keys after resetKeyCache()', async () => {
    const keys1 = await resolveKeys();
    resetKeyCache();
    const keys2 = await resolveKeys();
    // Different reference (may or may not be same key material depending on persistence)
    expect(keys1).not.toBe(keys2);
  });

  describe('getPublicJwk', () => {
    it('should return a valid Ed25519 JWK', async () => {
      const jwk = await getPublicJwk();
      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(jwk.x).toBeDefined();
      expect(jwk.kid).toBeDefined();
      expect(jwk.use).toBe('sig');
    });

    it('should not include the private key', async () => {
      const jwk = await getPublicJwk();
      expect(jwk).not.toHaveProperty('d');
    });
  });
});
