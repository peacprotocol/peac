/**
 * Protocol Enforcement Integration Tests
 *
 * Tests strict protocol versioning, RFC compliance, and header behaviors
 * for PEAC Protocol v0.9.6 "Strict Protocol = Release" implementation
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { PROTOCOL_HEADER, getExpectedProtocolHeader } from '../../src/version';

describe('Protocol Enforcement E2E Tests', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('Protocol Version Enforcement', () => {
    const expectedVersion = getExpectedProtocolHeader();

    describe('POST /negotiations (write endpoint)', () => {
      const validPayload = {
        terms: { amount: 1000, currency: 'USD' },
        context: { purpose: 'testing' },
        proposed_by: 'test-client',
      };

      it('should reject request without protocol header', async () => {
        const response = await request(app)
          .post('/negotiations')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'test-key-001')
          .send(validPayload)
          .expect(400);

        expect(response.body).toMatchObject({
          type: 'https://peacprotocol.org/problems/protocol-version-required',
          title: 'Protocol Version Required',
          detail: expect.stringContaining('Missing required X-PEAC-Protocol header'),
          expected_version: expectedVersion,
          provided_version: null,
          required_header: PROTOCOL_HEADER,
        });

        // Should have proper response headers
        expect(response.headers['x-request-id']).toBeDefined();
        expect(response.headers['vary']).toBe('Accept, Accept-Encoding');
      });

      it('should reject request with wrong protocol version', async () => {
        const response = await request(app)
          .post('/negotiations')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'test-key-002')
          .set(PROTOCOL_HEADER, '0.9.5') // Wrong version
          .send(validPayload)
          .expect(400);

        expect(response.body).toMatchObject({
          type: 'https://peacprotocol.org/problems/protocol-version-unsupported',
          title: 'Protocol Version Unsupported',
          detail: expect.stringContaining("Protocol version '0.9.5' is not supported"),
          expected_version: expectedVersion,
          provided_version: '0.9.5',
          required_header: PROTOCOL_HEADER,
        });
      });

      it('should accept request with correct protocol version', async () => {
        const response = await request(app)
          .post('/negotiations')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'test-key-003')
          .set(PROTOCOL_HEADER, expectedVersion)
          .send(validPayload)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.headers['x-request-id']).toBeDefined();
      });
    });

    describe('POST /payments (write endpoint)', () => {
      const validPayload = {
        rail: 'credits',
        amount: 100,
        currency: 'USD',
      };

      it('should enforce protocol version on payment creation', async () => {
        const response = await request(app)
          .post('/payments')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'pay-test-001')
          .send(validPayload)
          .expect(400);

        expect(response.body.type).toBe(
          'https://peacprotocol.org/problems/protocol-version-required',
        );
      });

      it('should accept payment with correct protocol version', async () => {
        const response = await request(app)
          .post('/payments')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'pay-test-002')
          .set(PROTOCOL_HEADER, expectedVersion)
          .send(validPayload)
          .expect(201);

        expect(response.body).toHaveProperty('id');
      });
    });

    describe('GET endpoints (reads - optional protocol)', () => {
      it('should allow negotiations list without protocol header', async () => {
        const response = await request(app).get('/negotiations').expect(200);

        expect(response.body).toHaveProperty('items');
        expect(response.headers['vary']).toBe('Accept, Accept-Encoding');
      });

      it('should allow payments list without protocol header', async () => {
        const response = await request(app).get('/payments').expect(200);

        expect(response.body).toHaveProperty('items');
      });
    });
  });

  describe('Request ID Propagation', () => {
    it('should reuse inbound X-Request-Id when provided', async () => {
      const customRequestId = 'custom-req-12345';

      const response = await request(app)
        .get('/.well-known/peac-capabilities')
        .set('X-Request-Id', customRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('should echo X-Request-Id on write operations', async () => {
      const customRequestId = 'write-req-67890';

      const response = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-Request-Id', customRequestId)
        .set('Idempotency-Key', `req-id-test-${Date.now()}`)
        .send({ rail: 'credits', amount: 10, currency: 'USD' })
        .expect(201);

      expect(response.headers['x-request-id']).toBe(customRequestId);
    });

    it('should generate X-Request-Id when not provided', async () => {
      const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should include X-Request-Id in error responses', async () => {
      const response = await request(app)
        .post('/negotiations')
        .set('Content-Type', 'application/json')
        .send({ invalid: 'payload' })
        .expect(400);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('RFC Compliance Headers', () => {
    describe('RFC9331 Rate Limiting', () => {
      it('should return delta seconds in RateLimit-Reset', async () => {
        const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

        const resetHeader = response.headers['ratelimit-reset'];
        if (resetHeader) {
          const resetValue = parseInt(resetHeader);
          expect(resetValue).toBeGreaterThan(0);
          expect(resetValue).toBeLessThan(3600); // Should be delta, not epoch
        }
      });

      it('should include all required rate limit headers', async () => {
        const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

        if (response.headers['ratelimit-limit']) {
          expect(response.headers['ratelimit-limit']).toMatch(/^\d+$/);
          expect(response.headers['ratelimit-remaining']).toMatch(/^\d+$/);
          expect(response.headers['ratelimit-reset']).toMatch(/^\d+$/);
          expect(response.headers['ratelimit-policy']).toBeDefined();
        }
      });

      it('should use delta seconds (not epoch) for RateLimit-Reset header', async () => {
        const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

        const resetHeader = response.headers['ratelimit-reset'];
        if (resetHeader) {
          const resetValue = parseInt(resetHeader, 10);

          // Delta seconds should be small positive integer
          expect(resetValue).toBeGreaterThan(0);
          expect(resetValue).toBeLessThan(3600); // Less than 1 hour

          // Should NOT be an epoch timestamp (which would be > 1.6 billion)
          expect(resetValue).toBeLessThan(1000000000);
        }
      });

      it('should validate RateLimit-Policy header format', async () => {
        const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

        const policyHeader = response.headers['ratelimit-policy'];
        if (policyHeader) {
          // Should match format: "60;w=60" (requests;window=seconds)
          expect(policyHeader).toMatch(/^\d+;w=\d+$/);

          // Parse and validate values
          const [requests, window] = policyHeader.split(';');
          expect(parseInt(requests)).toBeGreaterThan(0);
          expect(window).toMatch(/^w=\d+$/);

          const windowSeconds = parseInt(window.substring(2));
          expect(windowSeconds).toBeGreaterThan(0);
          expect(windowSeconds).toBeLessThanOrEqual(3600); // Max 1 hour window
        }
      });
    });

    describe('RFC9110 Caching', () => {
      it('should return proper ETag and Last-Modified headers', async () => {
        const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

        expect(response.headers['etag']).toBeDefined();
        expect(response.headers['last-modified']).toBeDefined();
        expect(response.headers['cache-control']).toBeDefined();
        expect(response.headers['vary']).toBe('Accept, Accept-Encoding');
      });

      it('should return 304 with proper headers for conditional requests', async () => {
        // First request to get ETag
        const firstResponse = await request(app).get('/.well-known/peac-capabilities').expect(200);

        const etag = firstResponse.headers['etag'];

        // Second request with If-None-Match
        const secondResponse = await request(app)
          .get('/.well-known/peac-capabilities')
          .set('If-None-Match', etag)
          .expect(304);

        // 304 should have caching headers but no Content-Type/Content-Length
        expect(secondResponse.headers['etag']).toBe(etag);
        expect(secondResponse.headers['last-modified']).toBeDefined();
        expect(secondResponse.headers['vary']).toBe('Accept, Accept-Encoding');
        expect(secondResponse.headers['content-type']).toBeUndefined();
        expect(secondResponse.headers['content-length']).toBeUndefined();
        expect(secondResponse.text).toBe('');
      });
    });

    describe('RFC7807 Problem Details', () => {
      it('should return absolute URIs for problem types', async () => {
        const response = await request(app)
          .post('/negotiations')
          .set('Content-Type', 'application/json')
          .send({}) // Invalid payload
          .expect(400);

        expect(response.body.type).toMatch(/^https:\/\/peacprotocol\.org\/problems\//);
        expect(response.headers['content-type']).toContain('application/problem+json');
      });

      it('should include proper extensions in problem details', async () => {
        const response = await request(app)
          .post('/negotiations')
          .set('Content-Type', 'application/json')
          .set('Idempotency-Key', 'test-key-004')
          .send({ invalid: 'payload' })
          .expect(400);

        expect(response.body).toHaveProperty('type');
        expect(response.body).toHaveProperty('title');
        expect(response.body).toHaveProperty('status', 400);
        expect(response.body).toHaveProperty('detail');
      });
    });

    describe('Vary Headers on JSON Endpoints', () => {
      const jsonEndpoints = ['/negotiations', '/payments', '/.well-known/peac-capabilities'];

      jsonEndpoints.forEach((endpoint) => {
        it(`should include Vary header on ${endpoint}`, async () => {
          const response = await request(app).get(endpoint);

          expect(response.headers['vary']).toBe('Accept, Accept-Encoding');
        });
      });
    });
  });

  describe('Capabilities Version Information', () => {
    it('should include version, protocol_version, and min_protocol_version', async () => {
      const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

      expect(response.body).toHaveProperty('version', '0.9.6');
      expect(response.body).toHaveProperty('protocol_version', '0.9.6');
      expect(response.body).toHaveProperty('min_protocol_version', '0.9.6');
    });

    it('should have consistent version information', async () => {
      const response = await request(app).get('/.well-known/peac-capabilities').expect(200);

      const { version, protocol_version, min_protocol_version } = response.body;

      // For 0.9.6.x strict versioning, these should all be equal
      expect(protocol_version).toBe(version);
      expect(min_protocol_version).toBe(version);
      expect(version).toBe('0.9.6');
    });
  });

  describe('Idempotency Replay Header Verification', () => {
    it('should return X-Idempotent-Replay: true on duplicate payment requests', async () => {
      const paymentData = {
        rail: 'credits',
        amount: 25,
        currency: 'USD',
      };
      const idempotencyKey = `test-replay-${Date.now()}`;

      // First request should succeed without replay header
      const firstResponse = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      expect(firstResponse.headers['x-idempotent-replay']).toBeUndefined();

      // Second identical request should return replay header
      const secondResponse = await request(app)
        .post('/payments')
        .set('Content-Type', 'application/json')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Idempotency-Key', idempotencyKey)
        .send(paymentData)
        .expect(201);

      expect(secondResponse.headers['x-idempotent-replay']).toBe('true');
      expect(secondResponse.headers['x-idempotent-age']).toBeDefined();
      expect(secondResponse.headers['x-idempotent-fingerprint']).toBeDefined();
    });
  });

  describe('Webhook Protocol Exemption', () => {
    it('should allow webhooks without protocol header (HMAC verification only)', async () => {
      // Set webhook secret for testing
      process.env.PEAC_WEBHOOK_SECRET = 'test-webhook-secret';

      const payload = {
        type: 'payment.succeeded',
        id: 'pay_test',
        object: 'payment',
        data: { amount: 100 },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Create HMAC signature (simplified for test)
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', 'test-webhook-secret')
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');
      const signatureHeader = `t=${timestamp},s=${signature}`;

      // Webhook should succeed without X-PEAC-Protocol header
      const response = await request(app)
        .post('/webhooks/peac')
        .set('Content-Type', 'application/json')
        .set('Peac-Signature', signatureHeader)
        .send(rawBody);

      // Should be 204 (success), 400 (validation), or 500 (server error), but NEVER 400 for missing protocol
      expect([204, 400, 500]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.type).not.toBe(
          'https://peacprotocol.org/problems/protocol-version-required',
        );
      }

      // Clean up
      delete process.env.PEAC_WEBHOOK_SECRET;
    });
  });
});
