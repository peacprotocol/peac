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

  // --- Session ID validation (MCP spec: visible ASCII 0x21-0x7E) ---

  it('should reject session ID with non-visible ASCII characters', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // Tab (0x09) passes HTTP header validation but is outside visible ASCII 0x21-0x7E
    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'session\tid',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('visible ASCII') });
  });

  it('should reject session ID with space characters', async () => {
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
        'Mcp-Session-Id': 'session with spaces',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    expect(status).toBe(400);
  });

  it('should reject session ID exceeding max length', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const longId = 'a'.repeat(200);
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': longId },
    });
    expect(status).toBe(400);
  });

  it('should reject invalid session ID on DELETE', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // High byte (0x80, obs-text) passes HTTP header validation but is outside visible ASCII 0x21-0x7E
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': 'bad\x80id' },
    });
    expect(status).toBe(400);
  });

  // --- PRM endpoint path-aware routing (RFC 9728) ---

  it('should serve PRM at root path when public-url has no path', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      resource: 'https://peac.example.com',
      authorization_servers: ['https://auth.example.com'],
    });
  });

  it('should serve PRM at path-aware location for /mcp public-url', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com/mcp',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // Should be at path-aware location
    const { status } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    expect(status).toBe(200);

    // Root well-known should NOT serve PRM (wrong path)
    const { status: rootStatus } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
    );
    expect(rootStatus).toBe(404);
  });

  it('should normalize trailing slash in public-url for PRM', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com/api/mcp/',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`
    );
    expect(status).toBe(200);
    // Resource URL should be normalized (no trailing slash)
    expect(body).toMatchObject({
      resource: expect.not.stringMatching(/\/$/),
    });
  });

  it('should reject public-url with fragment', async () => {
    const port = getPort();
    // Public URL with fragment should disable PRM
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com/mcp#section',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    // PRM disabled due to invalid public-url
    expect(status).toBe(404);
  });

  // --- Trust-proxy behavior ---

  it('should not trust X-Forwarded-For by default', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      rateLimitRpm: 2,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // X-Forwarded-For should be ignored (trust-proxy=off by default).
    // Send 3 POST /mcp requests with different XFF values but same actual IP.
    // With trust-proxy=off, all 3 share the same rate-limit key (real IP),
    // so the 3rd request should hit the rate limit (rpm=2).
    const mcpHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    for (let i = 0; i < 3; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          ...mcpHeaders,
          'X-Forwarded-For': `10.0.0.${i}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: i + 1,
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      if (i < 2) {
        // First two should succeed (initialize creates sessions)
        expect(status).not.toBe(429);
      } else {
        // Third should be rate-limited: XFF ignored, all keyed to same IP
        expect(status).toBe(429);
      }
    }
  });

  it('should trust XFF from loopback when trust-proxy=loopback', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      trustProxy: 'loopback',
      rateLimitRpm: 100,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // Request from 127.0.0.1 with XFF should use the XFF IP for rate limiting.
    // We just verify the server accepts the request (no crash, no 400).
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'X-Forwarded-For': '203.0.113.50',
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
    // Should succeed (loopback is trusted, XFF parsed)
    expect(status).not.toBe(429);
    expect(status).not.toBe(400);
  });

  // --- Per-IP session limits ---

  it('should enforce per-IP session creation limit', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      maxSessionsPerIp: 2,
      maxSessions: 100,
      rateLimitRpm: 100,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const mcpHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    // Create sessions until per-IP limit is hit
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          id: i + 1,
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      });
      statuses.push(status);
    }
    // First two should succeed, third should be rejected (per-IP limit = 2)
    expect(statuses[0]).not.toBe(503);
    expect(statuses[1]).not.toBe(503);
    expect(statuses[2]).toBe(503);
  });
});
