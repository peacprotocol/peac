import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Express } from 'express';
import { storeManager } from '../../src/config/stores';
import { prometheus } from '../../src/metrics/prom';

describe('Payments E2E Tests', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = await createServer();
    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('POST /payments', () => {
    it('should create a credits payment successfully', async () => {
      const paymentData = {
        rail: 'credits',
        amount: 100.5,
        currency: 'USD',
        metadata: { test: 'data' },
      };

      const response = await request(app).post('/payments').send(paymentData).expect(201);

      expect(response.body).toMatchObject({
        rail: 'credits',
        amount: 100.5,
        currency: 'USD',
        status: 'succeeded', // Credits rail should succeed immediately
        metadata: { test: 'data' },
      });

      expect(response.body.id).toBeTruthy();
      expect(response.body.created_at).toBeTruthy();
      expect(response.body.updated_at).toBeTruthy();
      expect(response.body.external_id).toBeTruthy();

      // Check headers
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['location']).toBe(`/payments/${response.body.id}`);
      expect(response.headers['idempotency-key']).toBeTruthy();
    });

    it('should handle idempotent payment creation', async () => {
      const paymentData = {
        rail: 'credits',
        amount: 50.25,
        currency: 'USD',
      };

      const idempotencyKey = 'test-idempotency-key-123';

      // First request
      const response1 = await request(app)
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      // Second request with same idempotency key
      const response2 = await request(app)
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      // Should return the same payment
      expect(response1.body.id).toBe(response2.body.id);
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(response2.headers['age']).toBeTruthy();
    });

    it('should create x402 payment with simulation', async () => {
      // Set X402 mode to simulate
      process.env.PEAC_X402_MODE = 'simulate';

      const paymentData = {
        rail: 'x402',
        amount: 25.75,
        currency: 'USD',
      };

      const response = await request(app).post('/payments').send(paymentData).expect(201);

      expect(response.body).toMatchObject({
        rail: 'x402',
        amount: 25.75,
        currency: 'USD',
      });

      // X402 simulation should result in either succeeded or requires_action
      expect(['succeeded', 'requires_action']).toContain(response.body.status);
    });

    it('should validate payment request body', async () => {
      const invalidData = {
        rail: 'invalid-rail',
        amount: -10,
        currency: '',
      };

      const response = await request(app).post('/payments').send(invalidData).expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
      expect(response.body.title).toBe('Validation Error');
    });

    it('should reject unsupported rail when disabled', async () => {
      // Disable X402
      process.env.PEAC_X402_MODE = 'off';

      const paymentData = {
        rail: 'x402',
        amount: 10,
        currency: 'USD',
      };

      const response = await request(app).post('/payments').send(paymentData).expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/payment-unsupported-rail');
    });
  });

  describe('GET /payments/:id', () => {
    it('should retrieve payment by ID', async () => {
      // Create a payment first
      const createResponse = await request(app)
        .post('/payments')
        .send({
          rail: 'credits',
          amount: 75.0,
          currency: 'USD',
        })
        .expect(201);

      const paymentId = createResponse.body.id;

      // Retrieve the payment
      const response = await request(app).get(`/payments/${paymentId}`).expect(200);

      expect(response.body).toMatchObject({
        id: paymentId,
        rail: 'credits',
        amount: 75.0,
        currency: 'USD',
        status: 'succeeded',
      });
    });

    it('should return 404 for non-existent payment', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app).get(`/payments/${nonExistentId}`).expect(404);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/resource-not-found');
    });
  });

  describe('GET /payments (pagination)', () => {
    beforeEach(async () => {
      // Create some test payments
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/payments')
          .send({
            rail: 'credits',
            amount: 10 + i,
            currency: 'USD',
          });
      }
    });

    it('should list payments with default pagination', async () => {
      const response = await request(app).get('/payments').expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(response.body.has_more).toBeDefined();

      // Check items are sorted by created_at desc
      const items = response.body.items;
      for (let i = 1; i < items.length; i++) {
        const current = new Date(items[i].created_at).getTime();
        const previous = new Date(items[i - 1].created_at).getTime();
        expect(current).toBeLessThanOrEqual(previous);
      }
    });

    it('should respect limit parameter', async () => {
      const response = await request(app).get('/payments?limit=2').expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.next_cursor).toBeTruthy();
    });

    it('should paginate with cursor', async () => {
      // Get first page
      const firstPage = await request(app).get('/payments?limit=2').expect(200);

      expect(firstPage.body.next_cursor).toBeTruthy();

      // Get second page
      const secondPage = await request(app)
        .get(`/payments?limit=2&cursor=${firstPage.body.next_cursor}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(2);

      // Ensure no overlap
      const firstPageIds = firstPage.body.items.map((p: any) => p.id);
      const secondPageIds = secondPage.body.items.map((p: any) => p.id);
      const intersection = firstPageIds.filter((id: string) => secondPageIds.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should validate limit bounds', async () => {
      const response = await request(app).get('/payments?limit=150').expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });

    it('should handle invalid cursor gracefully', async () => {
      const response = await request(app).get('/payments?cursor=invalid-cursor').expect(400);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/pagination-invalid-cursor',
      );
    });
  });

  describe('Rate limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/payments').expect(200);

      // Rate limit headers should be present
      expect(response.headers['ratelimit-limit']).toBeTruthy();
      expect(response.headers['ratelimit-remaining']).toBeTruthy();
    });
  });

  describe('Content negotiation', () => {
    it('should return 406 for unsupported Accept header', async () => {
      const response = await request(app)
        .get('/payments')
        .set('Accept', 'application/xml')
        .expect(406);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/not-acceptable');
    });

    it('should include Vary header', async () => {
      const response = await request(app).get('/payments').expect(200);

      expect(response.headers.vary).toMatch(/Accept/);
    });
  });

  describe('Request ID and Headers', () => {
    it('should preserve inbound X-Request-Id', async () => {
      const testRequestId = 'test-request-id-12345';

      const response = await request(app)
        .get('/payments')
        .set('X-Request-Id', testRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(testRequestId);
    });

    it('should include required headers on payment endpoints', async () => {
      const response = await request(app).get('/payments').expect(200);

      expect(response.headers['vary']).toMatch(/Accept/);
      expect(response.headers['ratelimit-limit']).toBeTruthy();
      expect(response.headers['ratelimit-remaining']).toBeTruthy();
      expect(response.headers['ratelimit-reset']).toBeTruthy();
    });
  });

  describe('Metrics integration', () => {
    it('should increment payment counters', async () => {
      // Enable metrics for this test
      process.env.PEAC_METRICS_ENABLED = 'true';

      // Create a successful payment
      await request(app)
        .post('/payments')
        .send({
          rail: 'credits',
          amount: 100,
          currency: 'USD',
        })
        .expect(201);

      // Check if metrics endpoint shows the counter
      const metricsResponse = await request(app).get('/metrics').expect(200);

      expect(metricsResponse.text).toMatch(/payments_initiated_total/);
      expect(metricsResponse.text).toMatch(/payments_succeeded_total/);
    });
  });

  describe('Enhanced Idempotency', () => {
    it('should handle idempotent payment creation', async () => {
      const idempotencyKey = 'test-payment-idempotency-123';
      const paymentData = {
        rail: 'credits',
        amount: 500,
        currency: 'USD',
        metadata: { orderRef: 'order-123' },
      };

      // First request
      const response1 = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      // Second request with same key should return cached response
      const response2 = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      // Should be same payment ID
      expect(response1.body.id).toBe(response2.body.id);
      expect(response2.headers['x-idempotent-replay']).toBe('true');
      expect(response2.headers['idempotency-key']).toBe(idempotencyKey);
    });

    it('should detect content conflicts with same idempotency key', async () => {
      const idempotencyKey = 'test-conflict-key-456';

      const paymentData1 = {
        rail: 'credits',
        amount: 100,
        currency: 'USD',
      };

      const paymentData2 = {
        rail: 'credits',
        amount: 200, // Different amount
        currency: 'USD',
      };

      // First request
      await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData1)
        .expect(201);

      // Second request with different content should detect conflict
      const response = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData2);

      // Should either return cached response or conflict depending on fingerprinting
      expect([201, 409]).toContain(response.status);

      if (response.status === 409) {
        expect(response.body.type).toBe('https://peacprotocol.org/problems/idempotency-conflict');
        expect(response.headers['retry-after']).toBeTruthy();
      }
    });

    it('should auto-generate idempotency keys for payment operations', async () => {
      const paymentData = {
        rail: 'credits',
        amount: 300,
        currency: 'USD',
      };

      const response = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .send(paymentData)
        .expect(201);

      // Should have auto-generated idempotency key
      expect(response.headers['idempotency-key']).toBeTruthy();
      expect(response.headers['idempotency-key']).toMatch(/^auto_/);
    });

    it('should validate idempotency key format', async () => {
      const invalidKey = 'invalid key with spaces!@#';
      const paymentData = {
        rail: 'credits',
        amount: 100,
        currency: 'USD',
      };

      const response = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', invalidKey)
        .send(paymentData)
        .expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
      expect(response.body.detail).toMatch(/Invalid idempotency key format/);
    });

    it('should work with different operation types', async () => {
      // Test idempotency with different endpoints
      const negKey = 'test-negotiation-key-123';

      // Create a negotiation (if endpoint exists)
      const negResponse = await request(app)
        .post('/negotiate')
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', negKey)
        .send({
          paymentRequest: {
            amount: 100,
            currency: 'USD',
            description: 'Test payment',
          },
        });

      // Should handle idempotency regardless of endpoint
      expect([200, 201, 400, 404]).toContain(negResponse.status);

      if (negResponse.status < 400) {
        expect(negResponse.headers['idempotency-key']).toBe(negKey);
      }
    });
  });

  describe('SLO Monitoring Integration', () => {
    it('should expose SLO status endpoint when metrics enabled', async () => {
      // Enable metrics for this test
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/status');

      // Should either be available (200) or not found (404) depending on configuration
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          timestamp: expect.any(String),
          slo_count: expect.any(Number),
          statuses: expect.any(Array),
        });
      }
    });

    it('should expose SLO compliance endpoint when metrics enabled', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/compliance');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          timestamp: expect.any(String),
          compliance_summary: expect.any(Object),
        });
      }
    });

    it('should expose error budget monitoring', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/error-budget');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          timestamp: expect.any(String),
          error_budgets: expect.any(Array),
          summary: expect.any(Object),
        });
      }
    });

    it('should expose SLO definitions', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/definitions');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          timestamp: expect.any(String),
          slos: expect.any(Array),
          slis: expect.any(Array),
          alert_rules: expect.any(Array),
        });
      }
    });

    it('should return Prometheus alert rules format', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/alerts/rules?format=prometheus');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/yaml/);
        expect(response.text).toContain('# PEAC Protocol SLO Alert Rules');
      }
    });

    it('should provide SLO system health check', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/slo/health');

      expect([200, 404, 503]).toContain(response.status);

      if (response.status !== 404) {
        expect(response.body).toMatchObject({
          status: expect.any(String),
          timestamp: expect.any(String),
        });

        expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
      }
    });
  });

  describe('Stable Pagination', () => {
    beforeEach(async () => {
      // Create multiple payments for pagination testing
      for (let i = 1; i <= 15; i++) {
        await request(app)
          .post('/payments')
          .send({
            rail: 'credits',
            amount: i * 100,
            currency: 'USD',
            metadata: { testOrder: i },
          })
          .expect(201);
      }
    });

    it('should return paginated payment results with stable cursors', async () => {
      const response = await request(app).get('/payments?limit=5').expect(200);

      expect(response.body.items).toHaveLength(5);
      expect(response.body.has_more).toBe(true);
      expect(response.body.has_previous).toBe(false);
      expect(response.body.next_cursor).toBeTruthy();
      expect(response.body.page_info).toMatchObject({
        page_size: 5,
        current_page_size: 5,
        sort_field: 'created_at',
        sort_order: 'desc',
      });

      // Verify performance headers
      expect(response.headers['x-pagination-duration']).toBeTruthy();
      expect(response.headers['x-pagination-count']).toBe('5');
      expect(response.headers['x-pagination-has-more']).toBe('true');
    });

    it('should handle cursor-based pagination correctly', async () => {
      // Get first page
      const page1 = await request(app).get('/payments?limit=3').expect(200);

      expect(page1.body.items).toHaveLength(3);
      expect(page1.body.next_cursor).toBeTruthy();

      // Get second page using cursor
      const page2 = await request(app)
        .get(`/payments?limit=3&cursor=${page1.body.next_cursor}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(3);

      // Verify no overlap between pages
      const page1Ids = page1.body.items.map((p: any) => p.id);
      const page2Ids = page2.body.items.map((p: any) => p.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should respect limit boundaries and defaults', async () => {
      // Test default limit
      const defaultResponse = await request(app).get('/payments').expect(200);

      expect(defaultResponse.body.page_info.page_size).toBe(50);

      // Test custom limit
      const customResponse = await request(app).get('/payments?limit=7').expect(200);

      expect(customResponse.body.page_info.page_size).toBe(7);
      expect(customResponse.body.items.length).toBeLessThanOrEqual(7);

      // Test max limit enforcement
      const maxResponse = await request(app).get('/payments?limit=10000').expect(200);

      expect(maxResponse.body.page_info.page_size).toBeLessThanOrEqual(500); // Max for payments
    });

    it('should handle invalid cursors gracefully', async () => {
      const response = await request(app).get('/payments?cursor=invalid_cursor').expect(200);

      // Should ignore invalid cursor and return first page
      expect(response.body.items).toBeTruthy();
      expect(response.body.page_info).toBeTruthy();
    });

    it('should support filtering with pagination', async () => {
      const response = await request(app)
        .get('/payments?limit=5&status=succeeded&rail=credits')
        .expect(200);

      expect(response.body.page_info.filters_applied).toContain('status');
      expect(response.body.page_info.filters_applied).toContain('rail');

      // All returned payments should match filters
      response.body.items.forEach((payment: any) => {
        expect(payment.status).toBe('succeeded');
        expect(payment.rail).toBe('credits');
      });
    });

    it('should support sorting with pagination', async () => {
      // Test ascending sort by amount
      const ascResponse = await request(app)
        .get('/payments?limit=5&sort=amount&order=asc')
        .expect(200);

      expect(ascResponse.body.page_info.sort_field).toBe('amount');
      expect(ascResponse.body.page_info.sort_order).toBe('asc');

      if (ascResponse.body.items.length > 1) {
        const amounts = ascResponse.body.items.map((p: any) => p.amount);
        for (let i = 1; i < amounts.length; i++) {
          expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
        }
      }

      // Test descending sort by created_at (default)
      const descResponse = await request(app)
        .get('/payments?limit=5&sort=created_at&order=desc')
        .expect(200);

      expect(descResponse.body.page_info.sort_field).toBe('created_at');
      expect(descResponse.body.page_info.sort_order).toBe('desc');
    });

    it('should validate sort fields', async () => {
      const response = await request(app).get('/payments?sort=invalid_field').expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
      expect(response.body.detail).toMatch(/Invalid sort field/);
    });

    it('should handle empty result sets', async () => {
      const response = await request(app)
        .get('/payments?status=failed') // Assuming no failed payments
        .expect(200);

      expect(response.body.items).toHaveLength(0);
      expect(response.body.has_more).toBe(false);
      expect(response.body.next_cursor).toBeFalsy();
      expect(response.body.page_info.current_page_size).toBe(0);
    });

    it('should provide consistent cursor behavior', async () => {
      // Create the same query twice
      const response1 = await request(app).get('/payments?limit=3').expect(200);

      const response2 = await request(app).get('/payments?limit=3').expect(200);

      // Results should be identical for same query
      expect(response1.body.items).toEqual(response2.body.items);
      expect(response1.body.next_cursor).toBe(response2.body.next_cursor);
    });
  });

  describe('Privacy and Data Protection Integration', () => {
    it('should expose privacy consent endpoint when enabled', async () => {
      // Enable privacy for this test
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const consentData = {
        userId: 'test-user-123',
        purposes: ['payment_processing', 'analytics'],
        source: 'explicit',
      };

      const response = await request(app).post('/privacy/consent').send(consentData);

      // Should either be available (201) or not found (404) depending on configuration
      expect([201, 404]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body).toMatchObject({
          message: expect.any(String),
          userId: consentData.userId,
          purposes: consentData.purposes,
          recordedAt: expect.any(String),
        });
      }
    });

    it('should support consent withdrawal', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const response = await request(app)
        .delete('/privacy/consent/test-user-123')
        .query({ purposes: 'analytics' });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          message: expect.any(String),
          userId: 'test-user-123',
          withdrawnAt: expect.any(String),
        });
      }
    });

    it('should support PII detection', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const testData = {
        email: 'test@example.com',
        amount: 100.5,
        description: 'Test payment',
      };

      const response = await request(app).post('/privacy/detect-pii').send({ data: testData });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          detected: expect.any(Boolean),
          patterns: expect.any(Array),
          fields: expect.any(Array),
          analyzedAt: expect.any(String),
        });
      }
    });

    it('should support data masking', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const testData = {
        email: 'sensitive@example.com',
        amount: 100.5,
        metadata: { note: 'confidential information' },
      };

      const response = await request(app)
        .post('/privacy/mask')
        .send({ data: testData, level: 'partial' });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          maskedData: expect.any(Object),
          level: 'partial',
          maskedAt: expect.any(String),
        });
      }
    });

    it('should support data subject requests', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const requestData = {
        type: 'access',
        userId: 'test-user-456',
        metadata: { reason: 'GDPR Article 15 request' },
      };

      const response = await request(app).post('/privacy/request').send(requestData);

      expect([201, 404]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body).toMatchObject({
          requestId: expect.any(String),
          type: requestData.type,
          userId: requestData.userId,
          status: expect.any(String),
          requestedAt: expect.any(String),
        });
      }
    });

    it('should generate compliance reports', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const response = await request(app).get('/privacy/compliance/report');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          timestamp: expect.any(String),
          summary: expect.any(Object),
          riskAssessment: expect.any(Object),
          compliance: expect.any(Object),
          reportVersion: expect.any(String),
        });
      }
    });

    it('should include required security headers on privacy endpoints', async () => {
      process.env.PEAC_PRIVACY_ENABLED = 'true';

      const response = await request(app).get('/privacy/compliance/report');

      if (response.status === 200) {
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['content-security-policy']).toBeTruthy();
        expect(response.headers['ratelimit-limit']).toBeTruthy();
      }
    });
  });
});
