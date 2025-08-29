import { generateKeyPair, exportJWKS } from '../../src/core/keys';

describe('Site Keys', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid Ed25519 key pair', () => {
      const kid = 'test-key-2024-01-01';
      const key = generateKeyPair(kid);

      expect(key.kid).toBe(kid);
      expect(key.created).toBeGreaterThan(0);
      expect(key.expires).toBeGreaterThan(key.created);
      expect(key.publicKey).toHaveLength(32); // Ed25519 public key is 32 bytes
      expect(key.privateKey).toHaveLength(32); // Ed25519 private key is 32 bytes
    });
  });

  describe('exportJWKS', () => {
    it('should export valid JWKS format', () => {
      const key = generateKeyPair('test-key');
      const jwks = exportJWKS([key]);

      expect(jwks).toHaveProperty('keys');
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys).toHaveLength(1);

      const jwk = jwks.keys[0];
      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(jwk.use).toBe('sig');
      expect(jwk.alg).toBe('EdDSA');
      expect(jwk.kid).toBe(key.kid);
      expect(jwk.x).toBeDefined();
      expect(jwk.d).toBeUndefined(); // Private key should not be included
    });

    it('should handle multiple keys', () => {
      const key1 = generateKeyPair('key-1');
      const key2 = generateKeyPair('key-2');
      const jwks = exportJWKS([key1, key2]);

      expect(jwks.keys).toHaveLength(2);
      expect(jwks.keys.map((k) => k.kid)).toEqual(['key-1', 'key-2']);
    });
  });
});
