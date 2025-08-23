/**
 * Health Endpoint Tests
 *
 * Tests for liveness and readiness health check endpoints.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('Health Endpoints', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('Liveness Endpoint', () => {
    it('should return 200 OK for liveness check', async () => {
      const response = await request(app).get('/health/live').expect(200);

      expect(response.body).toEqual({ status: 'ok', timestamp: expect.any(String) });
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Readiness Endpoint', () => {
    it('should return 200 OK for readiness check', async () => {
      const response = await request(app).get('/health/ready').expect(200);

      expect(response.body).toEqual({
        status: 'ready',
        timestamp: expect.any(String),
        checks: expect.any(Object),
      });
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
