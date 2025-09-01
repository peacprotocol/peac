/**
 * JSON Parse Error Tests
 *
 * Tests handling of malformed JSON in request bodies.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('JSON Parse Errors', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('Invalid JSON Handling', () => {
    it('should return 400 validation_error for invalid JSON to agreements', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.11')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }') // Malformed JSON
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    });

    it('should return 400 for malformed JSON to payments', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.11')
        .set('X-PEAC-Agreement', 'agr_test123')
        .set('Content-Type', 'application/json')
        .send('{ "amount": invalid }') // Malformed JSON
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    });

    it('should return 400 for completely invalid JSON', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.11')
        .set('Content-Type', 'application/json')
        .send('not json at all') // Not JSON
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    });
  });
});
