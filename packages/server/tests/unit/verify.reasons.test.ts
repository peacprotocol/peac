import { handleVerify } from '../../src/http/verify';
import type { Request, Response } from 'express';

// Metrics mock to capture increments
const verifyCounts: Array<Record<string, string>> = [];
const attributionCounts: Array<Record<string, string>> = [];

jest.mock('../../src/metrics', () => ({
  metrics: {
    verifyTotal: { inc: (labels: any) => verifyCounts.push(labels) },
    attributionCompliance: { inc: (labels: any) => attributionCounts.push(labels) },
  },
}));

// Mock dependencies we control per-test
const sessionOk = { sub: 'agent-1', exp: Math.floor(Date.now() / 1000) + 3600 };
jest.mock('../../src/core/session', () => ({
  verifySession: jest.fn(async (_t: string) => sessionOk),
}));

jest.mock('../../src/agents/identity', () => ({
  verifyAgentDescriptor: jest.fn(async (_d: any) => ({ jwk: { kty: 'RSA', n: 'x', e: 'AQAB' }, descriptor: {} })),
  checkPurposeAllowed: jest.fn((_d: any, _p: string) => true),
}));

jest.mock('../../src/crypto/dpop', () => ({
  verifyDPoP: jest.fn(async () => undefined),
}));

import * as jose from 'jose';
import { verifySession as mockVerifySession } from '../../src/core/session';
import { verifyAgentDescriptor as mockVerifyAgent, checkPurposeAllowed as mockPurpose } from '../../src/agents/identity';
import { verifyDPoP as mockVerifyDPoP } from '../../src/crypto/dpop';

function makeReq(init: Partial<Request>): Request {
  return {
    method: 'POST',
    protocol: 'http',
    get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:3000' : ''),
    originalUrl: '/verify',
    headers: {},
    body: {},
    ...init,
  } as unknown as Request;
}

function makeRes() {
  const out: any = {};
  out.statusCode = 0;
  out.body = undefined;
  const res: Partial<Response> = {
    status(code: number) { out.statusCode = code; return this as Response; },
    json(payload: any) { out.body = payload; return this as Response; },
  };
  return { res: res as Response, out };
}

beforeEach(() => {
  verifyCounts.splice(0);
  attributionCounts.splice(0);
  (mockVerifySession as jest.Mock).mockResolvedValue(sessionOk);
  (mockVerifyAgent as jest.Mock).mockResolvedValue({ jwk: { kty: 'RSA', n: 'x', e: 'AQAB' }, descriptor: {} });
  (mockPurpose as jest.Mock).mockReturnValue(true);
  (mockVerifyDPoP as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(jose, 'calculateJwkThumbprint').mockResolvedValue('jkt-ok' as any);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('session_missing', async () => {
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { /* no Authorization */ },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(401);
  expect(out.body.ok).toBe(false);
  expect(out.body.reasons).toContain('session_missing');
  expect(verifyCounts.length).toBe(1);
  expect(attributionCounts[0].outcome).toBe('missing');
});

test('missing_attribution co-reported with session_invalid', async () => {
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });
  (mockVerifySession as jest.Mock).mockRejectedValue(new Error('bad'));

  await handleVerify(req, res);
  expect(out.statusCode).toBe(401);
  expect(out.body.reasons).toEqual(['missing_attribution', 'session_invalid']);
  expect(verifyCounts.length).toBe(1);
  expect(attributionCounts[0].outcome).toBe('missing');
});

test('bad_request: missing agentDescriptor', async () => {
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x' },
    body: { expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(400);
  expect(out.body.reasons).toContain('bad_request');
  expect(attributionCounts[0].outcome).toBe('pass');
});

test('agent_invalid', async () => {
  (mockVerifyAgent as jest.Mock).mockRejectedValue(new Error('agent_invalid'));
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(403);
  expect(out.body.reasons).toEqual(['agent_invalid']);
});

test('purpose_not_allowed', async () => {
  (mockPurpose as jest.Mock).mockReturnValue(false);
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(403);
  expect(out.body.reasons).toEqual(['purpose_not_allowed']);
});

test('dpop_missing when jkt present', async () => {
  (mockVerifySession as jest.Mock).mockResolvedValue({ ...sessionOk, cnf: { jkt: 'jkt-ok' } });
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(401);
  expect(out.body.reasons).toEqual(['dpop_missing']);
});

test('dpop_thumbprint_mismatch', async () => {
  (mockVerifySession as jest.Mock).mockResolvedValue({ ...sessionOk, cnf: { jkt: 'DIFFERENT' } });
  jest.spyOn(jose, 'calculateJwkThumbprint').mockResolvedValue('jkt-ok' as any);

  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x', dpop: 'token' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(401);
  expect(out.body.reasons).toEqual(['dpop_thumbprint_mismatch']);
});

test('dpop_invalid', async () => {
  (mockVerifySession as jest.Mock).mockResolvedValue({ ...sessionOk, cnf: { jkt: 'jkt-ok' } });
  jest.spyOn(jose, 'calculateJwkThumbprint').mockResolvedValue('jkt-ok' as any);
  (mockVerifyDPoP as jest.Mock).mockRejectedValue(new Error('nope'));

  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x', dpop: 'token' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(401);
  expect(out.body.reasons).toEqual(['dpop_invalid']);
});

test('success path', async () => {
  const { res, out } = makeRes();
  const req = makeReq({
    headers: { authorization: 'Bearer token', 'x-attribution': 'x' },
    body: { agentDescriptor: { signature: 'a.b.c', jwk: { kty: 'RSA' } }, expectedPurpose: 'policy:read' }
  });

  await handleVerify(req, res);
  expect(out.statusCode).toBe(200);
  expect(out.body.ok).toBe(true);
  expect(verifyCounts[verifyCounts.length - 1].outcome).toBe('success');
  expect(attributionCounts[0].outcome).toBe('pass');
});
