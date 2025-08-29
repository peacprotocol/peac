import { createReceipt, verifyReceipt } from '../../src/core/receipts';
import { generateKeyPair } from '../../src/core/keys';

describe('Receipts with Key ID', () => {
  describe('createReceipt', () => {
    it('should create receipt with kid in header', async () => {
      const key = generateKeyPair('test-key-2024');
      
      const jws = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'test-user',
        tier: 'verified',
        method: 'POST',
        path: '/test/path',
        policyHash: 'abcd1234567890abcd1234567890abcd12345678',
        verifiedThumbprint: 'thumb123',
        key,
      });
      
      expect(typeof jws).toBe('string');
      expect(jws.split('.')).toHaveLength(3); // JWS compact format
      
      // Parse header to verify kid
      const [headerB64] = jws.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      
      expect(header.alg).toBe('EdDSA');
      expect(header.typ).toBe('application/peac-receipt');
      expect(header.kid).toBe(key.kid);
    });
  });

  describe('verifyReceipt', () => {
    it('should verify receipt with correct kid', async () => {
      const key = generateKeyPair('verify-test-key');
      
      const jws = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'test-user',
        tier: 'attributed',
        method: 'GET',
        path: '/api/test',
        policyHash: 'policy123456789012345678901234567890123456789',
        attribution: 'test-attribution',
        key,
      });
      
      const result = await verifyReceipt(jws, [key]);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.kid).toBe(key.kid);
        expect(result.alg).toBe('EdDSA');
        expect(result.claims.tier).toBe('attributed');
        expect(result.claims.attr).toBe('test-attribution');
        expect(result.claims.req.m).toBe('G');
      }
    });

    it('should fail with unknown kid', async () => {
      const key1 = generateKeyPair('key-1');
      const key2 = generateKeyPair('key-2');
      
      const jws = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'test-user',
        tier: 'anonymous',
        method: 'POST',
        path: '/test',
        policyHash: 'hash1234567890123456789012345678901234567890',
        key: key1,
      });
      
      // Try to verify with different key
      const result = await verifyReceipt(jws, [key2]);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('kid_unknown');
      }
    });

    it('should support multiple keys for verification', async () => {
      const key1 = generateKeyPair('key-1');
      const key2 = generateKeyPair('key-2');
      
      const jws1 = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'user-1',
        tier: 'anonymous',
        method: 'GET',
        path: '/test1',
        policyHash: 'hash1234567890123456789012345678901234567890',
        key: key1,
      });
      
      const jws2 = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'user-2',
        tier: 'attributed',
        method: 'POST',
        path: '/test2',
        policyHash: 'hash1234567890123456789012345678901234567890',
        key: key2,
      });
      
      // Both should verify with key set
      const result1 = await verifyReceipt(jws1, [key1, key2]);
      const result2 = await verifyReceipt(jws2, [key1, key2]);
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      
      if (result1.ok && result2.ok) {
        expect(result1.kid).toBe('key-1');
        expect(result2.kid).toBe('key-2');
      }
    });
  });
});