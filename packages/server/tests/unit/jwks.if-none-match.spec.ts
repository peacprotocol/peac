import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('JWKS If-None-Match handling', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  it('should return 304 for list-form If-None-Match containing the ETag', async () => {
    const r1 = await request(app).get('/.well-known/jwks.json');
    const etag = r1.headers.etag;

    const r2 = await request(app)
      .get('/.well-known/jwks.json')
      .set('If-None-Match', `${etag}, W/"dummy"`);

    expect(r2.status).toBe(304);
  });

  it('should return 200 for non-matching If-None-Match', async () => {
    const r = await request(app).get('/.well-known/jwks.json').set('If-None-Match', 'W/"no-match"');

    expect(r.status).toBe(200);
  });
});
