// Boundary coverage for the 256 KiB raw body-size invariant on the
// `/v1/verify` and `/v1/issue` Hosted Verify / Hosted Issue routes.
//
// Invariant under test (apps/api/src/verify-v1.ts:34, hosted-issue.ts:23):
//
//   const MAX_BODY_SIZE = 256 * 1024;
//
//   At exactly MAX_BODY_SIZE bytes:    request must NOT fail with
//                                      E_PAYLOAD_TOO_LARGE (status 413).
//   At MAX_BODY_SIZE + 1 bytes:        request MUST fail with
//                                      E_PAYLOAD_TOO_LARGE (status 413).
//
// The at-limit case asserts only the absence of the 413; the request
// may still fail downstream with E_INVALID_FORMAT or E_CONSTRAINT_VIOLATION
// because the synthetic padding does not produce a valid receipt or a
// valid issuance request body. The boundary invariant is narrower than
// end-to-end success and that is the only thing this test asserts.
//
// Verify-v1 enforcement path: Content-Length header pre-check at
//   apps/api/src/verify-v1.ts:185-188.
// Hosted-issue enforcement path: raw body read + TextEncoder byte count at
//   apps/api/src/hosted-issue.ts:86-91.

import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import {
  createVerifyV1Handler,
  createIssueV1Handler,
  resetVerifyV1RateLimit,
  isProblemError,
  PROBLEM_MEDIA_TYPE,
} from '../src/index.js';

const MAX_BODY_SIZE = 256 * 1024;

function buildApp() {
  resetVerifyV1RateLimit();
  const app = new Hono();
  app.onError((err, c) => {
    if (isProblemError(err)) {
      c.header('Content-Type', PROBLEM_MEDIA_TYPE);
      return c.body(JSON.stringify(err.toProblemDetails()), err.status);
    }
    return c.json({ title: 'Internal Server Error', status: 500 }, 500);
  });
  app.post('/v1/verify', createVerifyV1Handler());
  app.post('/v1/issue', createIssueV1Handler({ enabled: true }));
  return app;
}

const encoder = new TextEncoder();

function byteLength(s: string): number {
  return encoder.encode(s).byteLength;
}

function assertExactByteLength(body: string, targetBytes: number): void {
  const actual = byteLength(body);
  if (actual !== targetBytes) {
    throw new Error(`expected ${targetBytes} bytes, got ${actual}`);
  }
}

function makeBodyOfByteLength(prefix: string, suffix: string, targetBytes: number): string {
  const prefixLen = byteLength(prefix);
  const suffixLen = byteLength(suffix);
  const padLen = targetBytes - prefixLen - suffixLen;
  if (padLen < 0) {
    throw new Error(`target ${targetBytes} too small for prefix+suffix=${prefixLen + suffixLen}`);
  }
  return prefix + 'a'.repeat(padLen) + suffix;
}

function makeVerifyBody(targetBytes: number): string {
  // Verify schema: { receipt: string }. Padding goes inside the receipt
  // field. ASCII-only so byte length === string length.
  return makeBodyOfByteLength('{"receipt":"', '"}', targetBytes);
}

function makeIssueBody(targetBytes: number): string {
  // Issue schema: { claims: { iss, kind, type, ext? }, key_id, private_key_seed }.
  // claims.ext is an open record that accepts arbitrary strings, so the
  // padding lives in claims.ext.p. ASCII-only.
  const prefix = '{"claims":{"iss":"https://x","kind":"evidence","type":"y","ext":{"p":"';
  const suffix = '"}},"key_id":"k","private_key_seed":"AAAA"}';
  return makeBodyOfByteLength(prefix, suffix, targetBytes);
}

function postRequest(path: string, body: string, byteLen: number): Request {
  // Set Content-Length explicitly. The verify-v1 route's
  // E_PAYLOAD_TOO_LARGE pre-check reads the Content-Length header.
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(byteLen),
    },
    body,
  });
}

interface ProblemBody {
  status?: number;
  peac_error_code?: string;
}

async function readProblemBody(res: Response): Promise<ProblemBody | null> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as ProblemBody;
  } catch {
    return null;
  }
}

describe('apps/api body-size boundary: helpers self-check', () => {
  it('makeVerifyBody produces exact byte length', () => {
    const body = makeVerifyBody(MAX_BODY_SIZE);
    assertExactByteLength(body, MAX_BODY_SIZE);
    const overBody = makeVerifyBody(MAX_BODY_SIZE + 1);
    assertExactByteLength(overBody, MAX_BODY_SIZE + 1);
  });

  it('makeIssueBody produces exact byte length', () => {
    const body = makeIssueBody(MAX_BODY_SIZE);
    assertExactByteLength(body, MAX_BODY_SIZE);
    const overBody = makeIssueBody(MAX_BODY_SIZE + 1);
    assertExactByteLength(overBody, MAX_BODY_SIZE + 1);
  });
});

describe('POST /v1/verify body-size boundary', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it(`accepts body at exactly MAX_BODY_SIZE (${MAX_BODY_SIZE} bytes): no E_PAYLOAD_TOO_LARGE`, async () => {
    const body = makeVerifyBody(MAX_BODY_SIZE);
    assertExactByteLength(body, MAX_BODY_SIZE);
    const res = await app.fetch(postRequest('/v1/verify', body, MAX_BODY_SIZE));
    expect(res.status).not.toBe(413);
    const problem = await readProblemBody(res);
    if (problem) {
      expect(problem.peac_error_code).not.toBe('E_PAYLOAD_TOO_LARGE');
    }
  });

  it(`rejects body at MAX_BODY_SIZE + 1 (${MAX_BODY_SIZE + 1} bytes) with E_PAYLOAD_TOO_LARGE`, async () => {
    const body = makeVerifyBody(MAX_BODY_SIZE + 1);
    assertExactByteLength(body, MAX_BODY_SIZE + 1);
    const res = await app.fetch(postRequest('/v1/verify', body, MAX_BODY_SIZE + 1));
    expect(res.status).toBe(413);
    const problem = await readProblemBody(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
  });
});

describe('POST /v1/issue body-size boundary (PEAC_HOSTED_ISSUE enabled)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp();
  });

  it(`accepts body at exactly MAX_BODY_SIZE (${MAX_BODY_SIZE} bytes): no E_PAYLOAD_TOO_LARGE`, async () => {
    const body = makeIssueBody(MAX_BODY_SIZE);
    assertExactByteLength(body, MAX_BODY_SIZE);
    const res = await app.fetch(postRequest('/v1/issue', body, MAX_BODY_SIZE));
    expect(res.status).not.toBe(413);
    const problem = await readProblemBody(res);
    if (problem) {
      expect(problem.peac_error_code).not.toBe('E_PAYLOAD_TOO_LARGE');
    }
  });

  it(`rejects body at MAX_BODY_SIZE + 1 (${MAX_BODY_SIZE + 1} bytes) with E_PAYLOAD_TOO_LARGE`, async () => {
    const body = makeIssueBody(MAX_BODY_SIZE + 1);
    assertExactByteLength(body, MAX_BODY_SIZE + 1);
    const res = await app.fetch(postRequest('/v1/issue', body, MAX_BODY_SIZE + 1));
    expect(res.status).toBe(413);
    const problem = await readProblemBody(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
  });
});
