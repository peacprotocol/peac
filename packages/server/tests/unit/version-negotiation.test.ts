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

describe('Version Negotiation v0.9.12 (peac-version header, no x-peac-*)', () => {
  let app: ReturnType<typeof APP>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    app = APP();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('echoes version via peac-version when no header present', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.headers['peac-version']).toBe('0.9.11');
    expect(res.headers['peac-version-supported']).toBeUndefined();
  });

  it('accepts current version via peac-version', async () => {
    const res = await request(app).get('/test').set('peac-version', '0.9.12');
    expect(res.status).toBe(200);
    expect(res.headers['peac-version']).toBe('0.9.11');
  });

  it('rejects old version via peac-version with 426', async () => {
    const res = await request(app).get('/test').set('peac-version', '0.9.4');
    expect(res.status).toBe(426);
    expect(res.headers['peac-version-supported']).toBe('0.9.11');
  });

  it('rejects older version via peac-version with 426', async () => {
    const res = await request(app).get('/test').set('peac-version', '0.9.3');
    expect(res.status).toBe(426);
    expect(res.headers['peac-version-supported']).toBe('0.9.11');
  });

  it('rejects legacy x-peac-version header with 426', async () => {
    const res = await request(app).get('/test').set('x-peac-version', '0.9.11');
    expect(res.status).toBe(426);
    expect(res.headers['peac-version-supported']).toBe('0.9.11');
  });

  it('rejects when both x-peac-protocol-version and x-peac-version are present (legacy)', async () => {
    const res = await request(app)
      .get('/test')
      .set('x-peac-protocol-version', '0.9.11')
      .set('x-peac-version', '0.9.11');
    expect(res.status).toBe(426);
    expect(res.headers['peac-version-supported']).toBe('0.9.11');
  });

  it('rejects invalid version strings with 426', async () => {
    const res = await request(app).get('/test').set('x-peac-protocol-version', 'banana');
    expect(res.status).toBe(426);
    expect(res.headers['peac-version-supported']).toBe('0.9.11');
  });
});
