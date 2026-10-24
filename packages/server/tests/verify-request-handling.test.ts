import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';

// vi.mock is hoisted above imports, so the mock function must be created with vi.hoisted.
const { verifyReceipt } = vi.hoisted(() => ({ verifyReceipt: vi.fn() }));
vi.mock('@peac/protocol', () => ({ verifyReceipt }));

// Every Wire 0.1 compact JWS starts with these 16 characters: base64url of '{"typ":"peac'.
const SHARED_PREFIX = 'eyJ0eXAiOiJwZWFj';
const RECEIPT_A = `${SHARED_PREFIX}LTEuYSJ9.eyJpc3MiOiJhIn0.c2lnLWE`;
const RECEIPT_B = `${SHARED_PREFIX}LTEuYiJ9.eyJpc3MiOiJiIn0.c2lnLWI`;

/** The /verify request body limit in bytes. */
const MAX_BODY = 32 * 1024;

async function loadApp() {
  vi.resetModules();
  return (await import('../src/server')).app;
}

function post(
  app: Awaited<ReturnType<typeof loadApp>>,
  body: RequestInit['body'],
  headers: Record<string, string> = {}
) {
  return app.request('/verify', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('/verify request handling', () => {
  beforeEach(() => {
    verifyReceipt.mockReset();
    verifyReceipt.mockImplementation(async (jws: string) =>
      jws === RECEIPT_A
        ? { ok: true, claims: { iss: 'https://a.example' } }
        : { ok: false, reason: 'invalid_signature' }
    );
  });

  it("verifies each receipt on its own and never returns another receipt's result", async () => {
    const app = await loadApp();
    expect(
      await (await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }))).json()
    ).toMatchObject({ ok: true });
    const second = await (await post(app, JSON.stringify({ receipt_jws: RECEIPT_B }))).json();
    expect(second).toEqual({ ok: false, reason: 'invalid_signature' });
    expect(verifyReceipt).toHaveBeenCalledTimes(2);
  });

  it('does not let one rejected request change the result for a different receipt', async () => {
    const app = await loadApp();
    await post(app, JSON.stringify({ receipt_jws: SHARED_PREFIX }));
    expect(
      await (await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }))).json()
    ).toMatchObject({ ok: true });
  });

  it('rejects an oversized body with 413 before parsing (Content-Length declared)', async () => {
    const app = await loadApp();
    const body = 'x'.repeat(64 * 1024);
    const res = await post(app, body, { 'content-length': String(body.length) });
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(verifyReceipt).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed body with 413 (no Content-Length)', async () => {
    const app = await loadApp();
    const chunk = new TextEncoder().encode('x'.repeat(8 * 1024));
    const chunkCount = 16;
    let sent = 0;
    let pulledBytes = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < chunkCount) {
          pulledBytes += chunk.length;
          controller.enqueue(chunk);
        } else controller.close();
      },
    });
    const res = await app.request('/verify', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
    // The body is read only up to the limit plus stream read-ahead (measured: 6 of the 16 chunks),
    // never in full: the bound below is half of the 128 KiB body.
    expect(pulledBytes).toBeLessThanOrEqual(MAX_BODY + 4 * chunk.length);
    expect(verifyReceipt).not.toHaveBeenCalled();
  });

  it('answers malformed JSON with 400 and does not echo parser details', async () => {
    const app = await loadApp();
    const res = await post(app, '{"receipt_jws":');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const problem = (await res.json()) as { detail: string };
    expect(problem.detail).not.toMatch(/JSON at position|Unexpected|token/i);
  });

  it('marks verification responses as not cacheable', async () => {
    const app = await loadApp();
    const res = await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-cache')).toBeNull();
  });

  it('keeps existing validation behaviour', async () => {
    const app = await loadApp();
    const unknownMember = await post(app, JSON.stringify({ other: 1 }));
    expect(unknownMember.status).toBe(400);
    expect(((await unknownMember.json()) as { type: string }).type).toMatch(/\/invalid-request$/);
    const long = `${SHARED_PREFIX}${'a'.repeat(16_384)}`;
    const tooLong = await post(app, JSON.stringify({ receipt_jws: long }));
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { type: string }).type).toMatch(/\/jws-too-large$/);
  });
});

function streamOf(text: string, chunkSize = 4096): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

function postStream(app: Awaited<ReturnType<typeof loadApp>>, text: string) {
  return app.request('/verify', {
    method: 'POST',
    body: streamOf(text),
    headers: { 'content-type': 'application/json' },
    duplex: 'half',
  } as RequestInit);
}

/** A JSON body of exactly `size` bytes (ASCII) carrying one receipt_jws member. */
function bodyOfSize(size: number): string {
  const envelope = JSON.stringify({ receipt_jws: '' }).length;
  return JSON.stringify({ receipt_jws: 'a'.repeat(size - envelope) });
}

describe('/verify request handling: limits, errors and headers', () => {
  beforeEach(() => {
    verifyReceipt.mockReset();
    verifyReceipt.mockResolvedValue({ ok: false, reason: 'invalid_signature' });
  });

  it('answers an internal failure with a generic 500 that does not echo the error', async () => {
    verifyReceipt.mockRejectedValueOnce(new Error('internal detail /srv/keys/issuer.pem'));
    const app = await loadApp();
    const res = await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }));
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).not.toContain('internal detail');
  });

  it('answers with a generic 503 while the circuit breaker is open', async () => {
    verifyReceipt.mockRejectedValue(new Error('issuer unreachable'));
    const app = await loadApp();
    // Five consecutive failures open the breaker; each of them is a generic 500.
    for (let i = 0; i < 5; i++) {
      expect((await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }))).status).toBe(500);
    }
    const res = await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const problem = (await res.json()) as { type: string; detail: string };
    expect(problem.type).toMatch(/\/circuit-breaker$/);
    expect(problem.detail).toBe('Verification is temporarily unavailable');
    expect(verifyReceipt).toHaveBeenCalledTimes(5);
  });

  it('has no cache block on /slo and no Vary header on /verify', async () => {
    const app = await loadApp();
    const slo = (await (await app.request('/slo')).json()) as Record<string, unknown>;
    expect(slo).not.toHaveProperty('cache');
    const res = await post(app, JSON.stringify({ receipt_jws: RECEIPT_A }));
    expect(res.headers.get('vary')).toBeNull();
  });

  it('accepts exactly the limit and rejects one byte more (Content-Length declared)', async () => {
    const app = await loadApp();
    // At the limit the body is read and the JWS-length check answers 400, not 413.
    expect(
      (await post(app, bodyOfSize(MAX_BODY), { 'content-length': String(MAX_BODY) })).status
    ).toBe(400);
    expect(
      (await post(app, bodyOfSize(MAX_BODY + 1), { 'content-length': String(MAX_BODY + 1) })).status
    ).toBe(413);
  });

  it('accepts exactly the limit and rejects one byte more (streamed, no Content-Length)', async () => {
    const app = await loadApp();
    expect((await postStream(app, bodyOfSize(MAX_BODY))).status).toBe(400);
    expect((await postStream(app, bodyOfSize(MAX_BODY + 1))).status).toBe(413);
  });

  it('rejects an oversized chunked body over a real socket with 413', async () => {
    const app = await loadApp();
    let server: ReturnType<typeof serve> | undefined;
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) =>
        resolve(info.port)
      );
    });
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: '/verify',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        );
        req.on('error', reject);
        for (let i = 0; i < 16; i++) req.write('x'.repeat(4096)); // no Content-Length, so Node sends chunked
        req.end();
      });
      expect(status).toBe(413);
    } finally {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  it('answers 413 from an over-limit Content-Length before any body byte is sent (real socket)', async () => {
    const app = await loadApp();
    let server: ReturnType<typeof serve> | undefined;
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) =>
        resolve(info.port)
      );
    });
    try {
      const statusLine = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        let received = '';
        // Only the request head is sent; a server that waits for the body never answers.
        const timer = setTimeout(() => {
          socket.destroy();
          resolve('no response');
        }, 2000);
        socket.on('data', (data: Buffer) => {
          received += data.toString('latin1');
          const end = received.indexOf('\r\n');
          if (end !== -1) {
            clearTimeout(timer);
            socket.destroy();
            resolve(received.slice(0, end));
          }
        });
        socket.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        socket.write(
          'POST /verify HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n' +
            `Content-Length: ${MAX_BODY + 1}\r\n\r\n`
        );
      });
      expect(statusLine).toMatch(/^HTTP\/1\.1 413 /);
    } finally {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  it('answers a JSON array or scalar body with 400', async () => {
    const app = await loadApp();
    expect((await post(app, '[]')).status).toBe(400);
    expect((await post(app, '"x"')).status).toBe(400);
  });
});
