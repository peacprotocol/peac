/**
 * Idempotency Tests for Payment Charges
 *
 * Tests idempotent behavior of POST /peac/payments/charges with Idempotency-Key header.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { agreementStore } from '../../src/agreements/store';
import { Agreement } from '@peacprotocol/schema';

describe('Payment Charges Idempotency', () => {
  let app: Application;
  let validAgreement: Agreement;

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    app = await createServer();
  });

  beforeEach(() => {
    agreementStore.clear();

    // Create a valid agreement for testing
    validAgreement = {
      id: 'agr_01JFNKT5IDEMPOTENCY123456D',
      fingerprint: 'f'.repeat(64),
      protocol_version: '0.9.6',
      status: 'valid',
      created_at: new Date().toISOString(),
      proposal: {
        purpose: 'Idempotency test agreement',
        consent: { required: true, mechanism: 'api' },
        attribution: { required: false },
        pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
        terms: { text: 'Test terms' },
      },
    };

    agreementStore.set(validAgreement.id, validAgreement);
  });

  describe('Idempotency-Key Header Support', () => {
    it('should accept custom Idempotency-Key header', async () => {
      const customKey = 'custom-idempotency-key-12345';

      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', customKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(200);

      expect(response.headers['idempotency-key']).toBe(customKey);
      expect(response.headers['x-idempotent-replay']).toBeUndefined(); // First request
      expect(response.body).toMatchObject({
        id: expect.any(String),
        amount: '2500',
        currency: 'USD',
        agreement_id: validAgreement.id,
      });
    });

    it('should auto-generate Idempotency-Key if not provided', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(200);

      expect(response.headers['idempotency-key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('Idempotent Replay Behavior', () => {
    it('should return same response for duplicate idempotency key within TTL', async () => {
      const idempotencyKey = 'replay-test-key-001';

      // First request
      const response1 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
          metadata: { order_id: 'order_001' },
        })
        .expect(200);

      expect(response1.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response1.headers['x-idempotent-replay']).toBeUndefined();

      // Second request with same key
      const response2 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '3000', // Different amount - should be ignored
          currency: 'EUR', // Different currency - should be ignored
          metadata: { order_id: 'order_002' }, // Different metadata - should be ignored
        })
        .expect(200);

      expect(response2.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(response2.headers['age']).toBeDefined();

      // Response should be identical to first request
      expect(response2.body).toEqual(response1.body);
      expect(response2.body.amount).toBe('2500'); // Original amount, not 3000
      expect(response2.body.currency).toBe('USD'); // Original currency, not EUR
      expect(response2.body.metadata.order_id).toBe('order_001'); // Original metadata
    });

    it('should handle sequential requests with same idempotency key', async () => {
      const idempotencyKey = 'sequential-test-key';

      // First request
      const response1 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '1500',
          currency: 'USD',
        })
        .expect(200);

      // Short delay to ensure first request completes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second request with same key
      const response2 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '1500',
          currency: 'USD',
        })
        .expect(200);

      // First should be original
      expect(response1.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response1.headers['x-idempotent-replay']).toBeUndefined();

      // Second should be replay
      expect(response2.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(response2.headers['age']).toBeDefined();

      // Both should have identical response bodies
      expect(response1.body).toEqual(response2.body);
    });
  });

  describe('Error Scenarios', () => {
    it('should validate idempotency key length', async () => {
      const longKey = 'a'.repeat(300); // Exceeds max length

      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', longKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
        detail: expect.stringContaining('Idempotency key too long'),
      });
    });

    it('should not cache error responses', async () => {
      const idempotencyKey = 'error-test-key';

      // First request with invalid agreement (will fail)
      const response1 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', 'agr_nonexistent')
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(422);

      expect(response1.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response1.headers['x-idempotent-replay']).toBeUndefined();

      // Second request with same key but valid agreement (should process normally)
      const response2 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(200);

      expect(response2.headers['idempotency-key']).toBe(idempotencyKey);
      expect(response2.headers['x-idempotent-replay']).toBeUndefined(); // Not a replay since error wasn't cached
    });
  });

  describe('Scope Isolation', () => {
    it('should isolate idempotency keys by method and path', async () => {
      const idempotencyKey = 'scope-test-key';

      // POST to payments
      const response1 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(200);

      // POST to agreements with same key (different path)
      const response2 = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          purpose: 'Test agreement',
          consent: { required: true, mechanism: 'api' },
          attribution: { required: false },
          pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
          terms: { text: 'Test terms' },
        })
        .expect(201);

      // Both should be original requests (not replays) due to different scopes
      expect(response1.headers['x-idempotent-replay']).toBeUndefined();
      expect(response2.headers['x-idempotent-replay']).toBeUndefined();

      // Responses should be completely different
      expect(response1.body.id).not.toBe(response2.body.id);
    });
  });

  describe('Integration with Agreement Binding', () => {
    it('should maintain idempotency across different agreement headers', async () => {
      const idempotencyKey = 'agreement-test-key';

      // First request with one agreement
      const response1 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(200);

      // Create second agreement
      const secondAgreement: Agreement = {
        ...validAgreement,
        id: 'agr_second_agreement',
        fingerprint: 'e'.repeat(64),
      };
      agreementStore.set(secondAgreement.id, secondAgreement);

      // Second request with different agreement but same idempotency key
      const response2 = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', secondAgreement.id)
        .set('Idempotency-Key', idempotencyKey)
        .set('Content-Type', 'application/json')
        .send({
          amount: '3000',
          currency: 'EUR',
        })
        .expect(200);

      // Should return cached response from first request
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(response2.body).toEqual(response1.body);
      expect(response2.body.agreement_id).toBe(validAgreement.id); // Original agreement
    });
  });
});
