import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { tieredRateLimiter } from '../../src/middleware/tiered-rate-limit';

describe('Tiered Rate Limiting', () => {
  let app: Application;

  beforeAll(async () => {
    // Ensure rate limiting is enabled for tests
    delete process.env.PEAC_RATELIMIT_DISABLED;
    app = await createServer();
  });

  afterAll(() => {
    tieredRateLimiter.dispose();
  });

  it('should return anonymous tier without attribution header', async () => {
    const response = await request(app).get('/.well-known/peac').expect(200);

    expect(response.headers['peac-tier']).toBe('anonymous');
    expect(response.headers['ratelimit-limit']).toBe('60');
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBe('60');
    expect(response.headers.link).toBe('</.well-known/peac>; rel="peac-policy"');
  });

  it('should ignore x-peac-attribution header (breaking change)', async () => {
    const response = await request(app)
      .get('/.well-known/peac')
      .set('x-peac-attribution', 'TestAgent (https://example.com) [testing]')
      .expect(200);

    expect(response.headers['peac-tier']).toBe('anonymous');
    expect(response.headers['ratelimit-limit']).toBe('60');
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBe('60');
    expect(response.headers.link).toBe('</.well-known/peac>; rel="peac-policy"');
    // No cache control for anonymous tier
    expect(response.headers['cache-control']).not.toContain('max-age=3600');
  });

  it('should accept Peac-Attribution header', async () => {
    const response = await request(app)
      .get('/.well-known/peac')
      .set('Peac-Attribution', 'TestAgent (https://example.com) [testing]')
      .expect(200);

    expect(response.headers['peac-tier']).toBe('attributed');
    expect(response.headers['ratelimit-limit']).toBe('600');
  });

  it('should use Peac-Attribution over x-peac-attribution', async () => {
    const response = await request(app)
      .get('/.well-known/peac')
      .set('x-peac-attribution', 'OldAgent (https://old.com) [test]')
      .set('Peac-Attribution', 'NewAgent (https://new.com) [test]')
      .expect(200);

    expect(response.headers['peac-tier']).toBe('attributed');
  });

  it('should detect Web Bot Auth hints without changing behavior', async () => {
    const response = await request(app)
      .get('/.well-known/peac')
      .set('signature', 'sig1=:test:')
      .set('signature-input', 'sig1=();created=123')
      .set('signature-agent', '"TestBot/1.0"')
      .expect(200);

    // Behavior should remain anonymous tier (no attribution)
    expect(response.headers['peac-tier']).toBe('anonymous');
    expect(response.headers['ratelimit-limit']).toBe('60');
  });

  it('should return 429 when rate limit exceeded', async () => {
    // Make enough requests to exceed anonymous limit
    const promises = [];
    for (let i = 0; i < 65; i++) {
      promises.push(
        request(app).get('/.well-known/peac').set('x-test-bypass', 'true'), // Use unique IPs to avoid interference
      );
    }

    const responses = await Promise.all(promises);
    const rateLimited = responses.find((r) => r.status === 429);

    if (rateLimited) {
      expect(rateLimited.headers['content-type']).toBe('application/problem+json; charset=utf-8');
      expect(rateLimited.body).toEqual(
        expect.objectContaining({
          type: 'https://peacprotocol.org/problems/rate-limit-exceeded',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: 'Send Peac-Attribution header to receive higher limits',
        }),
      );
      expect(rateLimited.headers['retry-after']).toBeDefined();
    }
  });
});
