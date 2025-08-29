import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { verifiedRateLimiter } from '../../src/middleware/verified-rate-limit';

describe('Breaking Changes v0.9.9', () => {
  let app: Application;

  beforeAll(async () => {
    delete process.env.PEAC_RATELIMIT_DISABLED;
    app = await createServer();
  });

  afterAll(() => {
    verifiedRateLimiter.dispose();
  });

  describe('Header Migration', () => {
    it('should emit only Peac-* headers, never x-peac-*', async () => {
      const response = await request(app).get('/.well-known/peac').expect(200);

      expect(response.headers['peac-tier']).toBeDefined();
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers.link).toBe('</.well-known/peac>; rel="peac-policy"');

      // Must NOT emit any x-peac-* headers
      expect(response.headers['x-peac-tier']).toBeUndefined();
      expect(response.headers['x-peac-attribution']).toBeUndefined();
      expect(response.headers['x-peac-protocol-version']).toBeUndefined();
    });

    it('should ignore x-peac-attribution (no tier upgrade)', async () => {
      const response = await request(app)
        .get('/.well-known/peac')
        .set('x-peac-attribution', 'OldAgent (https://old.com) [test]')
        .expect(200);

      // Should remain anonymous tier despite old header
      expect(response.headers['peac-tier']).toBe('anonymous');
      expect(response.headers['ratelimit-limit']).toBe('60');
    });

    it('should upgrade tier with new Peac-Attribution header', async () => {
      const response = await request(app)
        .get('/.well-known/peac')
        .set('Peac-Attribution', '"NewAgent (https://new.com) [test]"')
        .expect(200);

      expect(response.headers['peac-tier']).toBe('attributed');
      expect(response.headers['ratelimit-limit']).toBe('600');
    });
  });

  describe('Canonical Endpoint', () => {
    it('should redirect /.well-known/peac.txt to canonical endpoint', async () => {
      const response = await request(app).get('/.well-known/peac.txt').expect(308);

      expect(response.headers['location']).toBe('/.well-known/peac');
      expect(response.headers['link']).toBe('</.well-known/peac>; rel="canonical peac-policy"');
      expect(response.headers['cache-control']).toBe(
        'public, max-age=300, stale-while-revalidate=86400',
      );
      expect(response.headers['content-length']).toBe('0');
      expect(response.text).toBe('');
    });

    it('should serve canonical /.well-known/peac normally', async () => {
      const response = await request(app).get('/.well-known/peac').expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('version: 0.9.10');
      expect(response.text).toContain('verified_rpm: 6000');
    });
  });

  describe('Policy v0.9.9', () => {
    it('should include verified tier in rate limits', async () => {
      const response = await request(app)
        .get('/.well-known/peac')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.body.version).toBe('0.9.10');
      expect(response.body.rate_limits).toEqual({
        anonymous_rpm: 60,
        attributed_rpm: 600,
        verified_rpm: 6000,
      });
    });
  });
});
