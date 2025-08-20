/**
 * Webhooks Success Path Tests - Valid HMAC → 204
 * 
 * Tests successful webhook processing with valid HMAC signatures.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { createWebhookSignature } from '../../src/webhooks/verify';

describe('Webhooks Success Path - Valid HMAC → 204', () => {
  let app: Application;
  const webhookSecret = 'test-webhook-secret-key';

  beforeAll(async () => {
    // Set webhook secret for testing
    process.env.PEAC_WEBHOOK_SECRET = webhookSecret;
    app = await createServer();
  });

  afterAll(() => {
    delete process.env.PEAC_WEBHOOK_SECRET;
  });

  describe('Valid HMAC Signature Processing', () => {
    it('should return 204 for valid agreement.created webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        agreement_id: 'agr_test_webhook_001',
        timestamp: timestamp,
        data: {
          purpose: 'Webhook test agreement',
          status: 'valid',
          fingerprint: 'abc123def456'
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_test_001')
        .send(raw)
        .expect(204);

      // Should have no response body for 204
      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('should return 204 for valid payment.completed webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'payment.completed',
        payment_id: 'pay_test_webhook_001',
        agreement_id: 'agr_test_webhook_001',
        amount: '2500',
        currency: 'USD',
        timestamp: timestamp,
        data: {
          processor: 'stripe',
          status: 'succeeded'
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_test_002')
        .send(raw)
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should return 204 for valid payment.failed webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'payment.failed',
        payment_id: 'pay_test_webhook_failed',
        agreement_id: 'agr_test_webhook_001',
        reason: 'insufficient_funds',
        timestamp: timestamp,
        data: {
          processor: 'stripe',
          error_code: 'card_declined'
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_test_003')
        .send(raw)
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should return 204 for valid agreement.updated webhook', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.updated',
        agreement_id: 'agr_test_webhook_001',
        changes: ['status'],
        timestamp: timestamp,
        data: {
          old_status: 'valid',
          new_status: 'expired',
          reason: 'time_expired'
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_test_004')
        .send(raw)
        .expect(204);
    });

    it('should return 204 for unknown webhook types (graceful handling)', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'unknown.event.type',
        resource_id: 'res_unknown_001',
        timestamp: timestamp,
        data: {
          custom_field: 'custom_value'
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_test_unknown')
        .send(raw)
        .expect(204);
    });
  });

  describe('Delivery Headers Validation', () => {
    it('should process webhook with optional Peac-Delivery-Id header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        agreement_id: 'agr_test_no_delivery_id',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      // Test without Peac-Delivery-Id header
      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(204);
    });

    it('should process webhook with custom headers', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'payment.completed',
        payment_id: 'pay_custom_headers',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_custom_001')
        .set('User-Agent', 'PEACWebhook/1.0')
        .set('X-Forwarded-For', '192.168.1.100')
        .send(raw)
        .expect(204);
    });
  });

  describe('Payload Variations', () => {
    it('should handle minimal webhook payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(204);
    });

    it('should handle webhook payload with complex nested data', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'payment.completed',
        payment_id: 'pay_complex_001',
        agreement_id: 'agr_complex_001',
        timestamp: timestamp,
        data: {
          payment: {
            amount: '5000',
            currency: 'EUR',
            processor: 'stripe',
            metadata: {
              order_id: 'order_12345',
              customer_id: 'cust_67890',
              custom_fields: {
                campaign: 'summer_2024',
                source: 'webhook_test'
              }
            }
          },
          agreement: {
            purpose: 'AI model training',
            expires_at: '2024-12-31T23:59:59Z'
          }
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_complex_001')
        .send(raw)
        .expect(204);
    });

    it('should handle webhook payload with Unicode characters', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        agreement_id: 'agr_unicode_test',
        timestamp: timestamp,
        data: {
          purpose: 'AI training for 中文内容 and العربية text processing 🤖',
          metadata: {
            description: 'Testing Unicode: café, naïve, résumé, 北京, العالم',
            emoji: '💡🔬📊'
          }
        }
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('Peac-Delivery-Id', 'delivery_unicode_001')
        .send(raw)
        .expect(204);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should return 204 even if webhook processing throws non-critical errors', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      // Use a payload that might cause processing issues but shouldn't fail signature validation
      const payload = {
        type: 'payment.completed',
        payment_id: null, // This might cause processing issues
        timestamp: timestamp,
        data: {}
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      // The webhook should still return 204 because the signature is valid
      // Processing errors should be logged but not cause webhook rejection
      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(204);
    });
  });

  describe('Content-Type Handling', () => {
    it('should handle webhook with explicit charset', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(raw)
        .expect(204);
    });
  });

  describe('Timing and Replay Protection', () => {
    it('should accept webhook with current timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = {
        type: 'agreement.created',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(204);
    });

    it('should accept webhook within tolerance window', async () => {
      // Use timestamp from 2 minutes ago (should be within tolerance)
      const timestamp = (Math.floor(Date.now() / 1000) - 120).toString();
      const payload = {
        type: 'payment.completed',
        timestamp: timestamp
      };

      const raw = JSON.stringify(payload);
      const signature = createWebhookSignature(webhookSecret, timestamp, raw, {
        method: 'POST',
        path: '/webhooks/peac'
      });

      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(204);
    });
  });
});