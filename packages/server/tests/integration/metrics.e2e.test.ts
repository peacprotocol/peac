import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('Metrics E2E Tests', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('GET /metrics', () => {
    it('should return 404 when metrics disabled', async () => {
      process.env.PEAC_METRICS_ENABLED = 'false';

      const response = await request(app).get('/metrics').expect(404);

      expect(response.text).toMatch(/Metrics not enabled/);
    });

    it('should return Prometheus metrics when enabled', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      const response = await request(app).get('/metrics').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(response.headers['cache-control']).toMatch(/no-cache/);

      // Check for expected metrics format
      expect(response.text).toMatch(/# HELP/);
      expect(response.text).toMatch(/# TYPE/);

      // Check for expected counters
      expect(response.text).toMatch(/http_requests_total/);
      expect(response.text).toMatch(/inflight_requests/);
    });

    it('should increment counters after HTTP traffic', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      // Generate some traffic
      await request(app).get('/.well-known/peac-capabilities').expect(200);
      await request(app).get('/livez').expect(200);

      const response = await request(app).get('/metrics').expect(200);

      // Should show some HTTP requests
      expect(response.text).toMatch(/http_requests_total.*[1-9]/);
    });

    it('should include payment and negotiation metrics', async () => {
      process.env.PEAC_METRICS_ENABLED = 'true';

      // Create a payment to generate metrics
      await request(app)
        .post('/payments')
        .send({
          rail: 'credits',
          amount: 10,
          currency: 'USD',
        })
        .expect(201);

      const response = await request(app).get('/metrics').expect(200);

      // Should include payment-related metrics
      expect(response.text).toMatch(/payments_initiated_total/);
      expect(response.text).toMatch(/payments_succeeded_total/);
    });
  });

  describe('GET /livez', () => {
    it('should return liveness check', async () => {
      const response = await request(app).get('/livez').expect(200);

      expect(response.body).toMatchObject({
        status: 'pass',
        checks: expect.arrayContaining([
          expect.objectContaining({
            name: 'process',
            status: 'pass',
          }),
        ]),
        uptime_seconds: expect.any(Number),
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /readyz', () => {
    it('should return readiness check', async () => {
      const response = await request(app).get('/readyz').expect(200);

      expect(response.body).toMatchObject({
        status: 'pass',
        checks: expect.arrayContaining([
          expect.objectContaining({
            name: 'stores',
            status: 'pass',
          }),
          expect.objectContaining({
            name: 'memory',
            status: 'pass',
          }),
        ]),
        uptime_seconds: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should include component check details', async () => {
      const response = await request(app).get('/readyz').expect(200);

      const storeCheck = response.body.checks.find((c: any) => c.name === 'stores');
      expect(storeCheck).toBeTruthy();
      expect(storeCheck.details).toBeTruthy();
      expect(storeCheck.duration_ms).toBeGreaterThanOrEqual(0);

      const memoryCheck = response.body.checks.find((c: any) => c.name === 'memory');
      expect(memoryCheck).toBeTruthy();
      expect(memoryCheck.details.heap_total_mb).toBeGreaterThan(0);
      expect(memoryCheck.details.heap_used_mb).toBeGreaterThan(0);
    });
  });
});
