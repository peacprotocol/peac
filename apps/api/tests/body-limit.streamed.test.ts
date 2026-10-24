// Streamed (chunked, no Content-Length) request bodies on the `/v1/verify`
// and `/v1/issue` routes.
//
// The 256 KiB raw body-size limit must hold for every request framing, not
// only for requests that declare a Content-Length header:
//
//   - a streamed body over the limit is rejected with 413 E_PAYLOAD_TOO_LARGE
//     (application/problem+json), and the body is not read past the limit;
//   - a streamed body within the limit is processed exactly like a
//     length-delimited body;
//   - a declared Content-Length over the limit is still rejected without
//     reading the body.
//
// The complementary Content-Length boundary cases live in
// body-limit.boundary.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { base64urlEncode, derivePublicKey } from '@peac/crypto';
import {
  createVerifyV1Handler,
  createIssueV1Handler,
  resetVerifyV1RateLimit,
  isProblemError,
  PROBLEM_MEDIA_TYPE,
} from '../src/index.js';

const MAX_BODY_SIZE = 256 * 1024;
const CHUNK_SIZE = 16 * 1024;

// 32-byte Ed25519 seed (all zeros) as base64url.
const SEED_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const encoder = new TextEncoder();

type StreamInit = RequestInit & { duplex: 'half' };

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

function makeBodyOfByteLength(prefix: string, suffix: string, targetBytes: number): string {
  const padLen =
    targetBytes - encoder.encode(prefix).byteLength - encoder.encode(suffix).byteLength;
  if (padLen < 0) {
    throw new Error(`target ${targetBytes} too small for prefix and suffix`);
  }
  return prefix + 'a'.repeat(padLen) + suffix;
}

function makeVerifyBody(targetBytes: number): string {
  return makeBodyOfByteLength('{"receipt":"', '"}', targetBytes);
}

function makeIssueBody(targetBytes: number): string {
  const prefix = '{"claims":{"iss":"https://x","kind":"evidence","type":"y","ext":{"p":"';
  const suffix = '"}},"key_id":"k","private_key_seed":"' + SEED_B64 + '"}';
  return makeBodyOfByteLength(prefix, suffix, targetBytes);
}

function splitIntoChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.slice(offset, offset + chunkSize));
  }
  return chunks;
}

interface PullCounter {
  pulledBytes: number;
}

// A pull-driven stream: a chunk is produced only when the consumer asks for
// one, so `pulledBytes` shows how much of the body was actually read.
function pullStream(chunks: Uint8Array[], counter: PullCounter): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        const chunk = chunks[index++];
        counter.pulledBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 }
  );
}

function streamedRequest(
  path: string,
  body: string,
  counter: PullCounter = { pulledBytes: 0 },
  extraHeaders: Record<string, string> = {}
): Request {
  const stream = pullStream(splitIntoChunks(encoder.encode(body), CHUNK_SIZE), counter);
  const init: StreamInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: stream,
    duplex: 'half',
  };
  const req = new Request(`http://localhost${path}`, init);
  return req;
}

// A body stream that delivers one chunk and then fails, as when a client
// disconnects in the middle of an upload.
function failingRequest(path: string): Request {
  let sentFirstChunk = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true;
          controller.enqueue(encoder.encode('{"receipt":"'));
          return;
        }
        controller.error(new Error('request stream failed'));
      },
    },
    { highWaterMark: 0 }
  );
  const init: StreamInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  };
  return new Request(`http://localhost${path}`, init);
}

interface ProblemBody {
  status?: number;
  peac_error_code?: string;
}

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

describe('streamed request framing: test helpers', () => {
  it('a streamed request carries no Content-Length header', () => {
    const req = streamedRequest('/v1/verify', makeVerifyBody(1024));
    expect(req.headers.has('content-length')).toBe(false);
  });

  it('helpers produce exact byte lengths', () => {
    expect(encoder.encode(makeVerifyBody(MAX_BODY_SIZE + 1)).byteLength).toBe(MAX_BODY_SIZE + 1);
    expect(encoder.encode(makeIssueBody(MAX_BODY_SIZE)).byteLength).toBe(MAX_BODY_SIZE);
  });
});

describe('POST /v1/verify streamed body limit', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  it('rejects a streamed body over the limit with 413 E_PAYLOAD_TOO_LARGE', async () => {
    const res = await app.fetch(streamedRequest('/v1/verify', makeVerifyBody(MAX_BODY_SIZE + 1)));
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain(PROBLEM_MEDIA_TYPE);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(problem?.status).toBe(413);
  });

  it('does not read a streamed body past the limit', async () => {
    const counter: PullCounter = { pulledBytes: 0 };
    const res = await app.fetch(
      streamedRequest('/v1/verify', makeVerifyBody(16 * MAX_BODY_SIZE), counter)
    );
    expect(res.status).toBe(413);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(counter.pulledBytes).toBeGreaterThan(MAX_BODY_SIZE);
    expect(counter.pulledBytes).toBeLessThanOrEqual(MAX_BODY_SIZE + 2 * CHUNK_SIZE);
  });

  it('accepts a streamed body of exactly the limit: no E_PAYLOAD_TOO_LARGE', async () => {
    const res = await app.fetch(streamedRequest('/v1/verify', makeVerifyBody(MAX_BODY_SIZE)));
    expect(res.status).not.toBe(413);
    const problem = await readJson<ProblemBody>(res);
    if (problem) {
      expect(problem.peac_error_code).not.toBe('E_PAYLOAD_TOO_LARGE');
    }
  });

  it('still rejects a declared Content-Length over the limit without reading the body', async () => {
    const counter: PullCounter = { pulledBytes: 0 };
    const res = await app.fetch(
      streamedRequest('/v1/verify', makeVerifyBody(MAX_BODY_SIZE + 1), counter, {
        'Content-Length': String(MAX_BODY_SIZE + 1),
      })
    );
    expect(res.status).toBe(413);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(counter.pulledBytes).toBe(0);
  });

  it('rejects a streamed multi-byte body that is over the limit in bytes but not in characters', async () => {
    const prefix = '{"receipt":"';
    const suffix = '"}';
    const body = prefix + '\u00e9'.repeat(MAX_BODY_SIZE / 2) + suffix;
    expect(body.length).toBeLessThan(MAX_BODY_SIZE);
    expect(encoder.encode(body).byteLength).toBeGreaterThan(MAX_BODY_SIZE);
    const res = await app.fetch(streamedRequest('/v1/verify', body));
    expect(res.status).toBe(413);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
  });

  it('returns 400 E_INVALID_FORMAT when the request body cannot be read', async () => {
    const res = await app.fetch(failingRequest('/v1/verify'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain(PROBLEM_MEDIA_TYPE);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_INVALID_FORMAT');
  });

  it('verifies a streamed body within the limit exactly like a length-delimited body', async () => {
    const issueRes = await app.fetch(
      new Request('http://localhost/v1/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
          key_id: 'k1',
          private_key_seed: SEED_B64,
        }),
      })
    );
    expect(issueRes.status).toBe(201);
    const issued = await readJson<{ receipt: string }>(issueRes);
    const receipt = issued?.receipt;
    expect(typeof receipt).toBe('string');

    const seed = new Uint8Array(32);
    const publicKey = base64urlEncode(await derivePublicKey(seed));
    const requestBody = JSON.stringify({ receipt, public_key: publicKey });

    const lengthDelimited = await app.fetch(
      new Request('http://localhost/v1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
    );
    expect(lengthDelimited.status).toBe(200);
    const expected = await lengthDelimited.text();

    const streamed = await app.fetch(streamedRequest('/v1/verify', requestBody));
    expect(streamed.status).toBe(200);
    const actual = await streamed.text();
    expect(JSON.parse(actual)).toMatchObject({ verified: true });
    expect(JSON.parse(actual)).toEqual(JSON.parse(expected));
  });
});

describe('POST /v1/issue streamed body limit (PEAC_HOSTED_ISSUE enabled)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  it('rejects a streamed body over the limit with 413 E_PAYLOAD_TOO_LARGE', async () => {
    const res = await app.fetch(streamedRequest('/v1/issue', makeIssueBody(MAX_BODY_SIZE + 1)));
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain(PROBLEM_MEDIA_TYPE);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(problem?.status).toBe(413);
  });

  it('does not read a streamed body past the limit', async () => {
    const counter: PullCounter = { pulledBytes: 0 };
    const res = await app.fetch(
      streamedRequest('/v1/issue', makeIssueBody(16 * MAX_BODY_SIZE), counter)
    );
    expect(res.status).toBe(413);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(counter.pulledBytes).toBeGreaterThan(MAX_BODY_SIZE);
    expect(counter.pulledBytes).toBeLessThanOrEqual(MAX_BODY_SIZE + 2 * CHUNK_SIZE);
  });

  it('accepts a streamed body of exactly the limit: no E_PAYLOAD_TOO_LARGE', async () => {
    const res = await app.fetch(streamedRequest('/v1/issue', makeIssueBody(MAX_BODY_SIZE)));
    expect(res.status).not.toBe(413);
    const problem = await readJson<ProblemBody>(res);
    if (problem) {
      expect(problem.peac_error_code).not.toBe('E_PAYLOAD_TOO_LARGE');
    }
  });

  it('rejects a declared Content-Length over the limit without reading the body', async () => {
    const counter: PullCounter = { pulledBytes: 0 };
    const res = await app.fetch(
      streamedRequest('/v1/issue', makeIssueBody(MAX_BODY_SIZE + 1), counter, {
        'Content-Length': String(MAX_BODY_SIZE + 1),
      })
    );
    expect(res.status).toBe(413);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_PAYLOAD_TOO_LARGE');
    expect(counter.pulledBytes).toBe(0);
  });

  it('returns 400 E_INVALID_FORMAT when the request body cannot be read', async () => {
    const res = await app.fetch(failingRequest('/v1/issue'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain(PROBLEM_MEDIA_TYPE);
    const problem = await readJson<ProblemBody>(res);
    expect(problem?.peac_error_code).toBe('E_INVALID_FORMAT');
  });

  it('issues from a streamed body within the limit', async () => {
    const res = await app.fetch(
      streamedRequest(
        '/v1/issue',
        JSON.stringify({
          claims: { iss: 'https://example.com', kind: 'evidence', type: 'org.peacprotocol/test' },
          key_id: 'k1',
          private_key_seed: SEED_B64,
        })
      )
    );
    expect(res.status).toBe(201);
    const issued = await readJson<{ receipt?: string; receipt_ref?: string }>(res);
    expect(typeof issued?.receipt).toBe('string');
    expect(typeof issued?.receipt_ref).toBe('string');
  });
});
