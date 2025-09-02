import express, { Request, Response } from 'express';
import request from 'supertest';
import { headerMiddleware, versionNegotiationMiddleware } from '../../src/middleware/headers';

const APP = () => {
  const app = express();
  app.use(headerMiddleware);
  app.use(versionNegotiationMiddleware);
  app.get('/test', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });
  return app;
};

describe('Version Negotiation (strict 0.9.11 only; no legacy)', () => {
  let app: ReturnType<typeof APP>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    app = APP();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('echoes 0.9.11 when no header present', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['x-peac-protocol-version']).toBe('0.9.11');
    expect(res.headers['x-peac-protocol-version-supported']).toBeUndefined();
  });

  it('accepts exact current version via x-peac-protocol-version', async () => {
    const res = await request(app).get('/test').set('x-peac-protocol-version', '0.9.11');
    expect(res.status).toBe(200);
    expect(res.headers['x-peac-protocol-version']).toBe('0.9.11');
  });

  it('rejects 0.9.4 via x-peac-protocol-version with 426 + supported list', async () => {
    const res = await request(app).get('/test').set('x-peac-protocol-version', '0.9.4');
    expect(res.status).toBe(426);
    expect(res.headers['x-peac-protocol-version-supported']).toBe('0.9.11');
  });

  it('rejects 0.9.3 via x-peac-protocol-version with 426 + supported list', async () => {
    const res = await request(app).get('/test').set('x-peac-protocol-version', '0.9.3');
    expect(res.status).toBe(426);
    expect(res.headers['x-peac-protocol-version-supported']).toBe('0.9.11');
  });

  it('rejects legacy header name x-peac-version (any value) with 426', async () => {
    const res = await request(app).get('/test').set('x-peac-version', '0.9.11');
    expect(res.status).toBe(426);
    expect(res.headers['x-peac-protocol-version-supported']).toBe('0.9.11');
  });

  it('rejects when both x-peac-protocol-version and x-peac-version are present', async () => {
    const res = await request(app)
      .get('/test')
      .set('x-peac-protocol-version', '0.9.11')
      .set('x-peac-version', '0.9.11');
    expect(res.status).toBe(426);
    expect(res.headers['x-peac-protocol-version-supported']).toBe('0.9.11');
  });

  it('rejects invalid version strings with 426', async () => {
    const res = await request(app).get('/test').set('x-peac-protocol-version', 'banana');
    expect(res.status).toBe(426);
    expect(res.headers['x-peac-protocol-version-supported']).toBe('0.9.11');
  });
});
