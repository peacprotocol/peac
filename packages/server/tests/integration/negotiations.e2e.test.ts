import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Express } from 'express';

describe('Negotiations E2E Tests', () => {
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

  describe('POST /negotiations', () => {
    it('should create a negotiation successfully', async () => {
      const negotiationData = {
        terms: { price: 100, duration: '30 days' },
        context: { use_case: 'ai_training' },
        proposed_by: 'test@example.com',
      };

      const response = await request(app).post('/negotiations').send(negotiationData).expect(201);

      expect(response.body).toMatchObject({
        state: 'proposed',
        terms: { price: 100, duration: '30 days' },
        context: { use_case: 'ai_training' },
        proposed_by: 'test@example.com',
      });

      expect(response.body.id).toBeTruthy();
      expect(response.body.created_at).toBeTruthy();
      expect(response.body.updated_at).toBeTruthy();

      // Check headers
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['location']).toBe(`/negotiations/${response.body.id}`);
    });

    it('should handle minimal negotiation data', async () => {
      const negotiationData = {};

      const response = await request(app).post('/negotiations').send(negotiationData).expect(201);

      expect(response.body.state).toBe('proposed');
      expect(response.body.id).toBeTruthy();
    });

    it('should validate terms and context are objects', async () => {
      const invalidData = {
        terms: 'invalid',
        context: 'invalid',
      };

      const response = await request(app).post('/negotiations').send(invalidData).expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });
  });

  describe('GET /negotiations/:id', () => {
    it('should retrieve negotiation by ID', async () => {
      // Create a negotiation first
      const createResponse = await request(app)
        .post('/negotiations')
        .send({
          terms: { amount: 500 },
          proposed_by: 'alice@example.com',
        })
        .expect(201);

      const negotiationId = createResponse.body.id;

      // Retrieve the negotiation
      const response = await request(app).get(`/negotiations/${negotiationId}`).expect(200);

      expect(response.body).toMatchObject({
        id: negotiationId,
        state: 'proposed',
        terms: { amount: 500 },
        proposed_by: 'alice@example.com',
      });
    });

    it('should return 404 for non-existent negotiation', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app).get(`/negotiations/${nonExistentId}`).expect(404);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/resource-not-found');
    });
  });

  describe('POST /negotiations/:id/accept', () => {
    let negotiationId: string;

    beforeEach(async () => {
      // Create a negotiation to accept
      const createResponse = await request(app)
        .post('/negotiations')
        .send({
          terms: { price: 200 },
          proposed_by: 'proposer@example.com',
        })
        .expect(201);

      negotiationId = createResponse.body.id;
    });

    it('should accept a proposed negotiation', async () => {
      const acceptData = {
        decided_by: 'accepter@example.com',
        metadata: { note: 'Good deal' },
      };

      const response = await request(app)
        .post(`/negotiations/${negotiationId}/accept`)
        .send(acceptData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: negotiationId,
        state: 'accepted',
        decided_by: 'accepter@example.com',
      });

      expect(new Date(response.body.updated_at).getTime()).toBeGreaterThan(
        new Date(response.body.created_at).getTime(),
      );
    });

    it('should reject accepting non-proposed negotiation', async () => {
      // First accept the negotiation
      await request(app)
        .post(`/negotiations/${negotiationId}/accept`)
        .send({ decided_by: 'first@example.com' })
        .expect(200);

      // Try to accept again
      const response = await request(app)
        .post(`/negotiations/${negotiationId}/accept`)
        .send({ decided_by: 'second@example.com' })
        .expect(409);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/invalid-negotiation-state',
      );
      expect(response.body.current_state).toBe('accepted');
    });

    it('should handle non-existent negotiation', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app)
        .post(`/negotiations/${nonExistentId}/accept`)
        .send({ decided_by: 'someone@example.com' })
        .expect(404);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/resource-not-found');
    });
  });

  describe('POST /negotiations/:id/reject', () => {
    let negotiationId: string;

    beforeEach(async () => {
      // Create a negotiation to reject
      const createResponse = await request(app)
        .post('/negotiations')
        .send({
          terms: { price: 1000 },
          proposed_by: 'proposer@example.com',
        })
        .expect(201);

      negotiationId = createResponse.body.id;
    });

    it('should reject a proposed negotiation', async () => {
      const rejectData = {
        reason: 'Price too high',
        decided_by: 'rejector@example.com',
      };

      const response = await request(app)
        .post(`/negotiations/${negotiationId}/reject`)
        .send(rejectData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: negotiationId,
        state: 'rejected',
        reason: 'Price too high',
        decided_by: 'rejector@example.com',
      });
    });

    it('should require rejection reason', async () => {
      const rejectData = {
        decided_by: 'rejector@example.com',
      };

      const response = await request(app)
        .post(`/negotiations/${negotiationId}/reject`)
        .send(rejectData)
        .expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
      expect(response.body.detail).toMatch(/reason.*required/i);
    });

    it('should reject empty reason', async () => {
      const rejectData = {
        reason: '   ',
        decided_by: 'rejector@example.com',
      };

      const response = await request(app)
        .post(`/negotiations/${negotiationId}/reject`)
        .send(rejectData)
        .expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });

    it('should reject rejecting non-proposed negotiation', async () => {
      // First reject the negotiation
      await request(app)
        .post(`/negotiations/${negotiationId}/reject`)
        .send({
          reason: 'First rejection',
          decided_by: 'first@example.com',
        })
        .expect(200);

      // Try to reject again
      const response = await request(app)
        .post(`/negotiations/${negotiationId}/reject`)
        .send({
          reason: 'Second rejection',
          decided_by: 'second@example.com',
        })
        .expect(409);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/invalid-negotiation-state',
      );
    });
  });

  describe('GET /negotiations (list and pagination)', () => {
    beforeEach(async () => {
      // Create test negotiations in different states
      const _proposedNeg = await request(app)
        .post('/negotiations')
        .send({ terms: { type: 'proposed' } })
        .expect(201);

      const acceptedNegId = (
        await request(app)
          .post('/negotiations')
          .send({ terms: { type: 'accepted' } })
          .expect(201)
      ).body.id;

      await request(app)
        .post(`/negotiations/${acceptedNegId}/accept`)
        .send({ decided_by: 'tester' })
        .expect(200);

      const rejectedNegId = (
        await request(app)
          .post('/negotiations')
          .send({ terms: { type: 'rejected' } })
          .expect(201)
      ).body.id;

      await request(app)
        .post(`/negotiations/${rejectedNegId}/reject`)
        .send({ reason: 'Test rejection', decided_by: 'tester' })
        .expect(200);
    });

    it('should list all negotiations by default', async () => {
      const response = await request(app).get('/negotiations').expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.items.length).toBeGreaterThanOrEqual(3);

      // Check items are sorted by created_at desc
      const items = response.body.items;
      for (let i = 1; i < items.length; i++) {
        const current = new Date(items[i].created_at).getTime();
        const previous = new Date(items[i - 1].created_at).getTime();
        expect(current).toBeLessThanOrEqual(previous);
      }
    });

    it('should filter by state', async () => {
      const response = await request(app).get('/negotiations?state=accepted').expect(200);

      expect(response.body.items).toBeInstanceOf(Array);
      response.body.items.forEach((item: any) => {
        expect(item.state).toBe('accepted');
      });
    });

    it('should validate state parameter', async () => {
      const response = await request(app).get('/negotiations?state=invalid').expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });

    it('should respect limit parameter', async () => {
      const response = await request(app).get('/negotiations?limit=2').expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(2);
    });

    it('should validate limit bounds', async () => {
      const response = await request(app).get('/negotiations?limit=150').expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });
  });

  describe('Request tracing', () => {
    it('should include X-Request-Id in responses', async () => {
      const response = await request(app).get('/negotiations').expect(200);

      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('should use provided X-Request-Id', async () => {
      const requestId = 'test-request-id-123';

      const response = await request(app)
        .get('/negotiations')
        .set('X-Request-Id', requestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(requestId);
    });
  });

  describe('Security headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/negotiations').expect(200);

      expect(response.headers['x-content-type-options']).toBeTruthy();
      expect(response.headers['x-frame-options']).toBeTruthy();
      expect(response.headers['x-xss-protection']).toBeUndefined(); // Should be removed
    });
  });
});
