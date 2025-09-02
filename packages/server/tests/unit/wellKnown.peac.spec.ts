import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { tieredRateLimiter } from '../../src/middleware/tiered-rate-limit';

describe('/.well-known/peac policy endpoint', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(() => {
    tieredRateLimiter.dispose();
  });

  it('should serve YAML policy by default', async () => {
    const response = await request(app).get('/.well-known/peac').expect(200);

    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.text).toContain('version: 0.9.11');
    expect(response.text).toContain('default: allow');
    expect(response.text).toContain('attribution:');
    expect(response.text).toContain('rate_limits:');
    expect(response.text).toContain('anonymous_rpm: 60');
    expect(response.text).toContain('attributed_rpm: 600');
    expect(response.text).toContain('verified_rpm: 6000');
  });

  it('should serve JSON policy when Accept: application/json', async () => {
    const response = await request(app)
      .get('/.well-known/peac')
      .set('Accept', 'application/json')
      .expect(200);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toEqual(
      expect.objectContaining({
        version: '0.9.11',
        default: 'allow',
        attribution: expect.objectContaining({
          required: false,
          format: 'AgentName (https://url) [purpose]',
          benefits: expect.objectContaining({
            rate_multiplier: 10,
            cache_ttl: 3600,
            priority: true,
          }),
        }),
        rate_limits: expect.objectContaining({
          anonymous_rpm: 60,
          attributed_rpm: 600,
          verified_rpm: 6000,
        }),
      }),
    );
  });

  it('should include proper caching headers', async () => {
    const response = await request(app).get('/.well-known/peac').expect(200);

    expect(response.headers['cache-control']).toBe(
      'public, max-age=300, stale-while-revalidate=60',
    );
    expect(response.headers['last-modified']).toBeDefined();
    expect(response.headers.vary).toBe('Accept');
  });

  it('should include CORS headers', async () => {
    const response = await request(app).get('/.well-known/peac').expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toBe('GET, HEAD, OPTIONS');
  });

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
});
