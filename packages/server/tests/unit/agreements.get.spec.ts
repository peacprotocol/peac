/**
 * Agreement Retrieval Tests - GET /peac/agreements/{id}
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('Agreement Retrieval - GET /peac/agreements/{id}', () => {
  let app: Application;
  let createdAgreement: any;

  beforeAll(async () => {
    app = await createServer();

    // Create test agreement
    const proposal = {
      purpose: 'Test agreement retrieval',
      consent: { required: true, mechanism: 'api' },
      attribution: { required: false },
      pricing_policy: { price: '1000', duration: 3600, usage: 'inference' as const },
      terms: { text: 'Test terms' },
    };

    const createResponse = await request(app)
      .post('/peac/agreements')
      .set('X-PEAC-Protocol', '0.9.6')
      .set('Content-Type', 'application/json')
      .send(proposal);

    createdAgreement = createResponse.body;
  });

  describe('Happy Path', () => {
    it('should return agreement with proper headers', async () => {
      const response = await request(app)
        .get(`/peac/agreements/${createdAgreement.id}`)
        .expect(200);

      expect(response.headers).toHaveProperty('etag');
      expect(response.headers.etag).toBe(`W/"${createdAgreement.fingerprint}"`);

      expect(response.headers['cache-control']).toBe(
        'public, max-age=300, stale-while-revalidate=60',
      );
      expect(response.headers.vary).toMatch(/Accept/);
      expect(response.headers.vary).toMatch(/Accept-Encoding/);

      expect(response.body).toEqual(createdAgreement);
    });

    it('should return 304 when If-None-Match matches ETag', async () => {
      const etag = `W/"${createdAgreement.fingerprint}"`;

      const response = await request(app)
        .get(`/peac/agreements/${createdAgreement.id}`)
        .set('If-None-Match', etag)
        .expect(304);

      expect(response.headers.etag).toBe(etag);
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers.vary).toMatch(/Accept/);
      expect(response.body).toEqual({});
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for unknown agreement ID', async () => {
      const response = await request(app).get('/peac/agreements/agr_unknown').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/not-found',
        status: 404,
        detail: 'Agreement agr_unknown not found',
      });
    });

    it('should return 404 for invalid agreement ID format', async () => {
      const response = await request(app).get('/peac/agreements/invalid_id').expect(404);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/not-found',
        status: 404,
        detail: 'Invalid agreement ID format',
      });
    });
  });

  describe('Caching Behavior', () => {
    it('should include proper cache headers on 200', async () => {
      const response = await request(app)
        .get(`/peac/agreements/${createdAgreement.id}`)
        .expect(200);

      expect(response.headers['cache-control']).toBe(
        'public, max-age=300, stale-while-revalidate=60',
      );
      expect(response.headers.vary).toMatch(/Accept, Accept-Encoding/);
    });

    it('should include proper cache headers on 304', async () => {
      const etag = `W/"${createdAgreement.fingerprint}"`;

      const response = await request(app)
        .get(`/peac/agreements/${createdAgreement.id}`)
        .set('If-None-Match', etag)
        .expect(304);

      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers.vary).toMatch(/Accept, Accept-Encoding/);
    });
  });
});
