/**
 * Negotiate Alias Tests - POST /peac/negotiate (deprecated)
 *
 * Tests deprecation headers for the backwards compatibility alias.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('Negotiate Alias - POST /peac/negotiate (deprecated)', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('Deprecation Headers', () => {
    it('should return 201 with all deprecation headers', async () => {
      const validProposal = {
        purpose: 'Test deprecation headers',
        consent: { required: true, mechanism: 'api' },
        attribution: { required: false },
        pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
        terms: { text: 'Test terms' },
      };

      const response = await request(app)
        .post('/peac/negotiate')
        .set('X-PEAC-Protocol', '0.9.10')
        .set('Content-Type', 'application/json')
        .send(validProposal)
        .expect(201);

      // Check all required deprecation headers
      expect(response.headers.deprecation).toBe('true');
      expect(response.headers.sunset).toBe('Wed, 30 Oct 2025 23:59:59 GMT');
      expect(response.headers.link).toBe('</peac/agreements>; rel="successor-version"');

      // Should still create a valid agreement (same as /peac/agreements)
      expect(response.body).toMatchObject({
        id: expect.stringMatching(/^agr_/),
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        protocol_version: '0.9.10',
        status: 'valid',
      });

      expect(response.headers).toHaveProperty('location');
      expect(response.headers.location).toMatch(/^\/peac\/agreements\/agr_/);
    });

    it('should return same validation errors as agreements endpoint', async () => {
      const response = await request(app)
        .post('/peac/negotiate')
        .set('X-PEAC-Protocol', '0.9.10')
        .set('Content-Type', 'application/json')
        .send({ invalid: 'proposal' })
        .expect(400);

      // Should have deprecation headers even on errors
      expect(response.headers.deprecation).toBe('true');
      expect(response.headers.sunset).toBe('Wed, 30 Oct 2025 23:59:59 GMT');
      expect(response.headers.link).toBe('</peac/agreements>; rel="successor-version"');

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
      });
    });

    it('should require protocol version like agreements endpoint', async () => {
      const response = await request(app)
        .post('/peac/negotiate')
        .set('Content-Type', 'application/json')
        .send({
          purpose: 'Test',
          consent: { required: true },
          attribution: { required: false },
          pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
          terms: { text: 'Test' },
        })
        .expect(426);

      // Should have deprecation headers even on protocol errors
      expect(response.headers.deprecation).toBe('true');
      expect(response.headers.sunset).toBe('Wed, 30 Oct 2025 23:59:59 GMT');
      expect(response.headers.link).toBe('</peac/agreements>; rel="successor-version"');

      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/protocol-version-required',
        status: 426,
      });
    });

    it('should include deprecation headers on unsupported media type errors', async () => {
      const response = await request(app)
        .post('/peac/negotiate')
        .set('X-PEAC-Protocol', '0.9.10')
        .set('Content-Type', 'text/plain')
        .send('invalid content type')
        .expect(415);

      // Should have deprecation headers even on content-type errors
      expect(response.headers.deprecation).toBe('true');
      expect(response.headers.sunset).toBe('Wed, 30 Oct 2025 23:59:59 GMT');
      expect(response.headers.link).toBe('</peac/agreements>; rel="successor-version"');

      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/unsupported-media-type',
        status: 415,
      });
    });
  });
});
