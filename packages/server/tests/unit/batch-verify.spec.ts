import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { generateKeyPair, keyStore } from '../../src/core/keys';
import { createReceipt } from '../../src/core/receipts';

describe('Batch Verify Endpoint', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
    
    // Set up a test key
    const testKey = generateKeyPair('test-batch-key');
    await keyStore.rotate(testKey);
  });

  describe('POST /.well-known/peac/verify', () => {
    it('should verify multiple valid receipts', async () => {
      const testKey = await keyStore.getActive();
      
      // Create test receipts
      const jws1 = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'user-1',
        tier: 'anonymous',
        method: 'GET',
        path: '/test1',
        policyHash: 'hash1234567890123456789012345678901234567890',
        key: testKey,
      });
      
      const jws2 = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'user-2',
        tier: 'attributed',
        method: 'POST',
        path: '/test2',
        policyHash: 'hash1234567890123456789012345678901234567890',
        attribution: 'test-attr',
        key: testKey,
      });
      
      const response = await request(app)
        .post('/.well-known/peac/verify')
        .send({ jws: [jws1, jws2] })
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      
      expect(response.body[0].ok).toBe(true);
      expect(response.body[0].kid).toBe(testKey.kid);
      expect(response.body[0].alg).toBe('EdDSA');
      
      expect(response.body[1].ok).toBe(true);
      expect(response.body[1].kid).toBe(testKey.kid);
    });

    it('should reject payload too large', async () => {
      // Create a large payload that exceeds the 64KB limit
      const largePayload = { jws: Array(1000).fill('a'.repeat(100)) }; // ~100KB
      
      const response = await request(app)
        .post('/.well-known/peac/verify')
        .send(largePayload)
        .expect(413);
      
      expect(response.body.type).toBe('https://peac.dev/problems/payload-too-large');
    }, 15000); // 15 second timeout

    it('should reject too many items', async () => {
      const jws = Array(101).fill('invalid.jws.token'); // More than 100 limit
      
      const response = await request(app)
        .post('/.well-known/peac/verify')
        .send({ jws })
        .expect(413);
      
      expect(response.body.type).toBe('https://peac.dev/problems/too-many-items');
    });
  });

  describe('GET /.well-known/peac/verify', () => {
    it('should verify single receipt via query param', async () => {
      const testKey = await keyStore.getActive();
      
      const jws = await createReceipt({
        issuer: 'https://test.peac.dev',
        subject: 'user-1',
        tier: 'anonymous',
        method: 'GET',
        path: '/test',
        policyHash: 'hash1234567890123456789012345678901234567890',
        key: testKey,
      });
      
      const response = await request(app)
        .get('/.well-known/peac/verify')
        .query({ jws })
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].ok).toBe(true);
    });

    it('should reject too many items for GET', async () => {
      const jws = Array(26).fill('invalid.jws.token'); // More than 25 limit for GET
      const query = jws.map(j => `jws=${j}`).join('&');
      
      const response = await request(app)
        .get(`/.well-known/peac/verify?${query}`)
        .expect(413);
      
      expect(response.body.type).toBe('https://peac.dev/problems/too-many-items');
    });
  });
});