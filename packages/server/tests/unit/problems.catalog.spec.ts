/**
 * Problem Catalog Tests - RFC 7807 Error Response Snapshots
 *
 * Golden tests to ensure consistent Problem+JSON formatting across all error types.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { agreementStore } from '../../src/agreements/store';
import { Agreement } from '@peacprotocol/schema';

describe('RFC 7807 Problem Catalog Snapshots', () => {
  let app: Application;
  let validAgreement: Agreement;

  beforeAll(async () => {
    app = await createServer();
  });

  beforeEach(() => {
    agreementStore.clear();

    // Create a valid agreement for reference error testing
    validAgreement = {
      id: 'agr_catalog_test_001',
      fingerprint: 'c'.repeat(64),
      protocol_version: '0.9.6',
      status: 'valid',
      created_at: new Date().toISOString(),
      proposal: {
        purpose: 'Catalog test agreement',
        consent: { required: true, mechanism: 'api' },
        attribution: { required: false },
        pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
        terms: { text: 'Test terms' },
      },
    };

    agreementStore.set(validAgreement.id, validAgreement);
  });

  describe('400 - Bad Request (validation-error)', () => {
    it('should return consistent problem details for malformed JSON', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      // Malformed JSON case doesn't include instance/trace_id (handled by Express)
      expect(response.body).toMatchSnapshot();
    });

    it('should return consistent problem details for missing required fields', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send({
          purpose: 'Test',
          // Missing required fields
        })
        .expect(400);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('404 - Not Found', () => {
    it('should return consistent problem details for unknown agreement', async () => {
      const response = await request(app).get('/peac/agreements/agr_unknown_agreement').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('409 - Conflict (agreement-mismatch)', () => {
    it('should return consistent problem details for fingerprint mismatch', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('X-PEAC-Fingerprint', 'd'.repeat(64)) // Wrong fingerprint
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(409);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('415 - Unsupported Media Type', () => {
    it('should return consistent problem details for wrong content type', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'text/plain')
        .send('{"purpose": "test"}')
        .expect(415);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('422 - Unprocessable Entity (invalid-reference)', () => {
    it('should return consistent problem details for missing agreement header', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(422);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });

    it('should return consistent problem details for unknown agreement reference', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', 'agr_nonexistent_ref')
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(422);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('426 - Upgrade Required (protocol-version-required)', () => {
    it('should return consistent problem details for missing protocol header', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('Content-Type', 'application/json')
        .send({
          purpose: 'Test agreement',
          consent: { required: true, mechanism: 'api' },
          attribution: { required: false },
          pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
          terms: { text: 'Test terms' },
        })
        .expect(426);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });

    it('should return consistent problem details for unsupported protocol version', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.8.0')
        .set('Content-Type', 'application/json')
        .send({
          purpose: 'Test agreement',
          consent: { required: true, mechanism: 'api' },
          attribution: { required: false },
          pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
          terms: { text: 'Test terms' },
        })
        .expect(426);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('500 - Internal Server Error', () => {
    it('should return consistent problem details for internal errors', async () => {
      // Force an internal error by using an invalid provider that will fail
      process.env.PAYMENT_PROVIDER = 'invalid_provider';

      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD',
        })
        .expect(500);

      expect(response.body).toMatchSnapshot({
        instance: expect.any(String),
        error: expect.any(String), // Error messages may vary
      });

      // Reset to mock provider
      process.env.PAYMENT_PROVIDER = 'mock';
    });
  });

  describe('RFC 7807 Compliance', () => {
    it('should include required RFC 7807 fields in all error responses', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Verify required RFC 7807 fields
      expect(response.body).toMatchObject({
        type: expect.stringMatching(/^https:\/\/peacprotocol\.org\/problems\//),
        title: expect.any(String),
        status: expect.any(Number),
        detail: expect.any(String),
      });

      // Verify content-type header
      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    });

    it('should use peacprotocol.org namespace for problem types', async () => {
      const responses = await Promise.all([
        request(app).get('/peac/agreements/agr_nonexistent').expect(404),
        request(app)
          .post('/peac/agreements')
          .set('Content-Type', 'text/plain')
          .send('test')
          .expect(426), // Protocol check happens first
        request(app).post('/peac/agreements').expect(426),
      ]);

      responses.forEach((response) => {
        expect(response.body.type).toMatch(/^https:\/\/peacprotocol\.org\/problems\//);
      });
    });
  });
});
