/**
 * HTTP transport integration tests (DD-119, DD-123)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport } from '../../src/http-transport.js';

function makeServerFactory(): () => McpServer {
  return () => {
    const server = new McpServer(
      { name: 'test-server', version: '0.0.1' },
      { capabilities: { tools: { listChanged: false } } }
    );
    return server;
  };
}

// Helper: find a free port
let nextPort = 13000;
function getPort(): number {
  return nextPort++;
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const res = await fetch(url, init);
  const body = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, headers: res.headers, body };
}

describe('HTTP Transport', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('should start and respond to health check', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/health`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, version: expect.any(String) });
  });

  it('should return 404 for unknown paths', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/unknown`);
    expect(status).toBe(404);
  });

  it('should return 405 for GET /mcp', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`);
    expect(status).toBe(405);
    expect(body).toMatchObject({ error: expect.stringContaining('Method Not Allowed') });
  });

  it('should return 400 for non-init POST without session ID', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('Mcp-Session-Id') });
  });

  it('should return 404 for unknown session ID', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'nonexistent-session',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });
    expect(status).toBe(404);
  });

  it('should return 404 for PRM when unconfigured', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
    );
    expect(status).toBe(404);
  });

  it('should serve PRM when configured with authorization-servers and public-url', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com/mcp',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // PRM should be at path-aware location
    const { status, body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      resource: 'https://peac.example.com/mcp',
      authorization_servers: ['https://auth.example.com'],
    });
  });

  it('should reject oversized request bodies', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      maxRequestBytes: 100,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const bigBody = JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: { data: 'x'.repeat(200) },
    });
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigBody,
    });
    expect(status).toBe(400);
  });

  it('should deny cross-origin requests by default', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.com',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} }),
    });
    expect(status).toBe(403);
  });

  it('should allow configured CORS origins', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      corsOrigins: ['https://trusted.com'],
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // Health check with allowed origin should succeed
    const { status, headers } = await fetchJson(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'https://trusted.com' },
    });
    expect(status).toBe(200);
    expect(headers.get('access-control-allow-origin')).toBe('https://trusted.com');
  });

  it('should handle DELETE /mcp with missing session ID', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
    });
    expect(status).toBe(400);
  });

  it('should handle DELETE /mcp with unknown session ID', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': 'nonexistent' },
    });
    expect(status).toBe(404);
  });

  it('should return 400 for invalid JSON body', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });
    expect(status).toBe(400);
  });

  it('should return 400 for unsupported MCP protocol version', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '1999-01-01',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    expect(status).toBe(400);
  });

  it('should handle CORS preflight OPTIONS request', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      corsOrigins: ['https://trusted.com'],
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://trusted.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
