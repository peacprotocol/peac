/**
 * HTTP transport integration tests
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SUPPORTED_PROTOCOL_VERSIONS as SDK_SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import {
  createHttpTransport,
  rateLimitKeyFor,
  MAX_RATE_LIMIT_KEYS,
} from '../../src/http-transport.js';

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

const MCP_ACCEPT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

/**
 * Perform a real initialize request against a running transport and return
 * the assigned Mcp-Session-Id, for tests that need a genuinely valid session.
 */
async function initSession(port: number): Promise<string> {
  const { status, headers } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: MCP_ACCEPT_HEADERS,
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
  if (status !== 200) {
    throw new Error(`initSession failed: expected 200, got ${status}`);
  }
  const sessionId = headers.get('mcp-session-id');
  if (!sessionId) {
    throw new Error('initSession failed: no Mcp-Session-Id header in response');
  }
  return sessionId;
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

  // --- RFC 9728 PRM strict compliance ---

  it('should set Content-Type: application/json on PRM response', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { headers } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
    );
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('should return only resource and authorization_servers in PRM (no extra fields)', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'https://peac.example.com/mcp',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    const keys = Object.keys(body as Record<string, unknown>);
    expect(keys).toEqual(expect.arrayContaining(['resource', 'authorization_servers']));
    expect(keys).toHaveLength(2);
  });

  it('should accept multiple authorization servers in PRM', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth1.example.com', 'https://auth2.example.com'],
      publicUrl: 'https://peac.example.com',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
    );
    expect((body as { authorization_servers: string[] }).authorization_servers).toEqual([
      'https://auth1.example.com',
      'https://auth2.example.com',
    ]);
  });

  it('should disable PRM when public-url is non-HTTPS on non-loopback', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: 'http://peac.example.com/mcp',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    expect(status).toBe(404);
  });

  it('should allow http public-url on loopback for dev ergonomics', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      authorizationServers: ['https://auth.example.com'],
      publicUrl: `http://localhost:${port}/mcp`,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
    );
    expect(status).toBe(200);
    expect((body as { resource: string }).resource).toMatch(/^http:\/\/localhost/);
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

  it('should ignore spoofed XFF from non-loopback peer when trust-proxy=loopback', async () => {
    // When trust-proxy=loopback, requests from 127.0.0.1 (loopback) trust XFF.
    // But the test itself connects from 127.0.0.1, so we verify by setting
    // trust-proxy to a specific IP that is NOT 127.0.0.1 to simulate
    // an untrusted peer sending a forged XFF header.
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      trustProxy: '10.0.0.1', // Only trust 10.0.0.1 (not 127.0.0.1)
      rateLimitRpm: 2,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const mcpHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // XFF should be IGNORED because peer_ip (127.0.0.1) is not in trusted set (10.0.0.1).
    // All requests key to the same peer_ip for rate limiting.
    for (let i = 0; i < 3; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          ...mcpHeaders,
          'X-Forwarded-For': `192.168.${i}.1`, // Spoofed, should be ignored
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
        expect(status).not.toBe(429);
      } else {
        // Third request rate-limited: XFF ignored, all keyed to same peer_ip
        expect(status).toBe(429);
      }
    }
  });

  // --- Multi-client isolation (CVE-2026-25536 stop-ship invariant) ---

  it('should isolate concurrent client sessions (CVE-2026-25536 regression)', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      maxSessions: 10,
      rateLimitRpm: 100,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const mcpHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Concurrently initialize 3 sessions
    const initResults = await Promise.all(
      [1, 2, 3].map((id) =>
        fetchJson(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: mcpHeaders,
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            id,
            params: {
              protocolVersion: '2025-11-25',
              capabilities: {},
              clientInfo: { name: `client-${id}`, version: '1.0' },
            },
          }),
        })
      )
    );

    // All 3 initializations must succeed
    for (const r of initResults) {
      expect(r.status).toBe(200);
    }

    // Each session must have a unique Mcp-Session-Id
    const sessionIds = initResults.map((r) => r.headers.get('mcp-session-id'));
    const uniqueIds = new Set(sessionIds.filter(Boolean));
    expect(uniqueIds.size).toBe(3);

    // Terminating one session must not affect others
    const [id0, id1, id2] = sessionIds;
    const { status: deleteStatus } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': id0! },
    });
    expect(deleteStatus).toBe(200);

    // Terminated session returns 404
    const { status: gone } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { ...mcpHeaders, 'Mcp-Session-Id': id0! },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 10 }),
    });
    expect(gone).toBe(404);

    // Other sessions still alive
    for (const sid of [id1, id2]) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { ...mcpHeaders, 'Mcp-Session-Id': sid! },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 11 }),
      });
      expect(status).toBe(200);
    }
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

  // --- MCP-Protocol-Version validation on non-init requests ---
  // The version is checked on every request, before session-id handling.

  it('should accept non-init POST with the latest supported protocol version', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const sessionId = await initSession(port);
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_ACCEPT_HEADERS,
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    });
    expect(status).toBe(200);
  });

  it('should accept non-init POST with the legacy supported protocol version', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const sessionId = await initSession(port);
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_ACCEPT_HEADERS,
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    });
    expect(status).toBe(200);
  });

  it('should accept non-init POST with no protocol version header (assumes 2025-03-26 per spec backwards-compat)', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const sessionId = await initSession(port);
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_ACCEPT_HEADERS,
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    });
    expect(status).toBe(200);
  });

  it('should reject non-init POST declaring an unsupported protocol version, naming supported versions and not mentioning the session', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const sessionId = await initSession(port);
    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_ACCEPT_HEADERS,
        'Mcp-Session-Id': sessionId,
        'MCP-Protocol-Version': '2026-07-28',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    });
    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: expect.stringContaining('2026-07-28'),
    });
    expect(body).toMatchObject({
      error: expect.stringContaining('2025-11-25'),
    });
    expect(body).toMatchObject({
      error: expect.stringContaining('2025-03-26'),
    });
    const message = (body as { error: string }).error;
    expect(message.toLowerCase()).not.toContain('session');
  });

  it('should reject an unsupported protocol version before falling back to the missing-session-id error (ordering)', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // No Mcp-Session-Id header at all AND an unsupported version: the
    // version check must win so the failure reason is unambiguous.
    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_ACCEPT_HEADERS,
        'MCP-Protocol-Version': '2026-07-28',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 2 }),
    });
    expect(status).toBe(400);
    const message = (body as { error: string }).error;
    expect(message).toContain('2026-07-28');
    expect(message.toLowerCase()).not.toContain('session');
  });

  it('should reject init POST with an unsupported protocol version (existing behavior preserved)', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { ...MCP_ACCEPT_HEADERS, 'MCP-Protocol-Version': '2026-07-28' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2026-07-28',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    expect(status).toBe(400);
    const message = (body as { error: string }).error;
    expect(message).toContain('2026-07-28');
  });

  it.each([
    { label: 'whitespace-only', value: '   ', expectRejected: true },
    { label: 'very long ASCII', value: 'x'.repeat(5000), expectRejected: true },
    { label: 'mixed case near-match', value: 'ThE-LaTeSt-VeRsIoN', expectRejected: true },
    { label: 'wrong-but-plausible date', value: '2025-03-27', expectRejected: true },
    {
      label: 'supported value with surrounding junk stripped by HTTP',
      value: '2025-11-25',
      expectRejected: false,
    },
  ])(
    'should never throw and always return a deterministic response for odd MCP-Protocol-Version value: $label',
    async ({ value, expectRejected }) => {
      const port = getPort();
      const result = await createHttpTransport({
        port,
        host: '127.0.0.1',
        serverFactory: makeServerFactory(),
      });
      cleanup = result.cleanup;

      const sessionId = await initSession(port);
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          ...MCP_ACCEPT_HEADERS,
          'Mcp-Session-Id': sessionId,
          'MCP-Protocol-Version': value,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 3 }),
      });
      // Every case here is a deterministic 400 (rejected) or 200 (accepted)
      // -- never a thrown exception, a hang, or a 5xx.
      expect(status).toBe(expectRejected ? 400 : 200);
    }
  );

  it('should treat an absent MCP-Protocol-Version header (not an empty string) as the assumed default on non-init requests', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const sessionId = await initSession(port);
    const headers: Record<string, string> = { ...MCP_ACCEPT_HEADERS, 'Mcp-Session-Id': sessionId };
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 3 }),
    });
    expect(status).toBe(200);
  });
});

// --- Accepted protocol versions follow the SDK's supported list ---

/** Extract result.protocolVersion from an initialize response (JSON or SSE-framed). */
function negotiatedVersionFrom(body: unknown): string | undefined {
  let message: unknown = body;
  if (typeof body === 'string') {
    const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) return undefined;
    message = JSON.parse(dataLine.slice('data: '.length));
  }
  const result = (message as { result?: { protocolVersion?: unknown } } | null)?.result;
  return typeof result?.protocolVersion === 'string' ? result.protocolVersion : undefined;
}

/** True when a JSON or SSE-framed JSON-RPC response carries a result (not an error). */
function hasJsonRpcResult(body: unknown): boolean {
  let message: unknown = body;
  if (typeof body === 'string') {
    const dataLine = body.split('\n').find((line) => line.startsWith('data: '));
    if (!dataLine) return false;
    message = JSON.parse(dataLine.slice('data: '.length));
  }
  return typeof message === 'object' && message !== null && 'result' in message;
}

/** Parse the "(supported versions: a, b, c)" list out of a rejection message. */
function supportedVersionsIn(message: string): string[] {
  const match = /\(supported versions: ([^)]*)\)/.exec(message);
  return match ? match[1].split(', ') : [];
}

/** Send initialize for `requestedVersion`, optionally with an MCP-Protocol-Version header. */
async function initializeRequesting(
  port: number,
  requestedVersion: string,
  headerVersion?: string
): Promise<{
  status: number;
  sessionId: string | null;
  negotiatedVersion: string | undefined;
  body: unknown;
}> {
  const headers: Record<string, string> = { ...MCP_ACCEPT_HEADERS };
  if (headerVersion !== undefined) headers['MCP-Protocol-Version'] = headerVersion;
  const res = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: requestedVersion,
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    }),
  });
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id'),
    negotiatedVersion: res.status === 200 ? negotiatedVersionFrom(res.body) : undefined,
    body: res.body,
  };
}

/** Send a ping on an existing session declaring `version`. */
async function pingWithVersion(
  port: number,
  sessionId: string,
  version: string
): Promise<{ status: number; body: unknown }> {
  const { status, body } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      ...MCP_ACCEPT_HEADERS,
      'Mcp-Session-Id': sessionId,
      'MCP-Protocol-Version': version,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 2 }),
  });
  return { status, body };
}

describe('HTTP Transport: accepted protocol versions follow the SDK', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  async function start(): Promise<number> {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;
    return port;
  }

  it('relies on an SDK list that contains 2025-06-18 and not 2026-07-28', () => {
    expect(SDK_SUPPORTED_PROTOCOL_VERSIONS).toContain('2025-06-18');
    expect(SDK_SUPPORTED_PROTOCOL_VERSIONS).toContain('2024-11-05');
    expect(SDK_SUPPORTED_PROTOCOL_VERSIONS).not.toContain('2026-07-28');
  });

  it('accepts every SDK-supported protocol version on requests after initialize', async () => {
    const port = await start();
    const sessionId = await initSession(port);
    const outcomes = [];
    for (const version of SDK_SUPPORTED_PROTOCOL_VERSIONS) {
      const { status, body } = await pingWithVersion(port, sessionId, version);
      outcomes.push({ version, status, result: hasJsonRpcResult(body) });
    }
    expect(outcomes).toEqual(
      SDK_SUPPORTED_PROTOCOL_VERSIONS.map((version) => ({ version, status: 200, result: true }))
    );
  });

  it('serves a 2025-06-18 client across initialize and later requests', async () => {
    const port = await start();
    const init = await initializeRequesting(port, '2025-06-18');
    expect(init.status).toBe(200);
    expect(init.negotiatedVersion).toBe('2025-06-18');
    expect(init.sessionId).toBeTruthy();

    // The SDK client sends the negotiated version on every later request.
    for (let i = 0; i < 3; i++) {
      const follow = await pingWithVersion(port, init.sessionId!, '2025-06-18');
      expect(follow.status).toBe(200);
      expect(hasJsonRpcResult(follow.body)).toBe(true);
    }
  });

  it('accepts a 2025-06-18 MCP-Protocol-Version header on the initialize request itself', async () => {
    const port = await start();
    const init = await initializeRequesting(port, '2025-06-18', '2025-06-18');
    expect(init.status).toBe(200);
    expect(init.negotiatedVersion).toBe('2025-06-18');
  });

  it('serves a client the SDK negotiates to 2024-11-05 on later requests', async () => {
    const port = await start();
    const init = await initializeRequesting(port, '2024-11-05');
    expect(init.status).toBe(200);
    expect(init.negotiatedVersion).toBe('2024-11-05');

    const follow = await pingWithVersion(port, init.sessionId!, '2024-11-05');
    expect(follow.status).toBe(200);
    expect(hasJsonRpcResult(follow.body)).toBe(true);
  });

  it('accepts on later requests whatever version the SDK negotiated, for any requested version', async () => {
    const port = await start();
    const requested = [...SDK_SUPPORTED_PROTOCOL_VERSIONS, '2026-07-28', '1999-01-01'];
    const outcomes = [];
    for (const version of requested) {
      const init = await initializeRequesting(port, version);
      expect(init.status).toBe(200);
      expect(init.negotiatedVersion).toBeDefined();
      const follow = await pingWithVersion(port, init.sessionId!, init.negotiatedVersion!);
      outcomes.push({ requested: version, status: follow.status });
    }
    expect(outcomes).toEqual(requested.map((version) => ({ requested: version, status: 200 })));
  });

  it('rejects 2026-07-28 after initialize with a 400 listing exactly the SDK-supported versions', async () => {
    const port = await start();
    const sessionId = await initSession(port);
    const { status, body } = await pingWithVersion(port, sessionId, '2026-07-28');
    expect(status).toBe(400);
    const message = (body as { error: string }).error;
    expect(message).toContain('Unsupported MCP protocol version: 2026-07-28');
    expect(supportedVersionsIn(message)).toEqual([...SDK_SUPPORTED_PROTOCOL_VERSIONS]);
  });

  it('rejects a 2026-07-28 header on initialize with a 400 listing exactly the SDK-supported versions', async () => {
    const port = await start();
    const init = await initializeRequesting(port, '2026-07-28', '2026-07-28');
    expect(init.status).toBe(400);
    expect(init.sessionId).toBeNull();
    const message = (init.body as { error: string }).error;
    expect(message).toContain('Unsupported MCP protocol version: 2026-07-28');
    expect(supportedVersionsIn(message)).toEqual([...SDK_SUPPORTED_PROTOCOL_VERSIONS]);
  });
});

// --- Rate-limit keys and bounds ---

describe('HTTP Transport: rate-limit keys and bounds', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  const pingBody = JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 });

  it('describes the rate limit as per session or client address at startup', async () => {
    const write = vi.spyOn(process.stderr, 'write');
    try {
      const port = getPort();
      const result = await createHttpTransport({
        port,
        host: '127.0.0.1',
        rateLimitRpm: 7,
        serverFactory: makeServerFactory(),
      });
      cleanup = result.cleanup;
      const lines = write.mock.calls.map((call) => String(call[0]));
      expect(lines).toContain('  Rate limit: 7 req/min per session or client address\n');
      expect(lines).toContain(
        '  Mode: unprotected (no token validation; deploy behind an authenticating reverse proxy)\n'
      );
    } finally {
      write.mockRestore();
    }
  });

  it('limits requests with rotating unknown session ids at the per-address rate', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      rateLimitRpm: 10,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    let limited = 0;
    let passed = 0;
    for (let i = 0; i < 1000; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { ...MCP_ACCEPT_HEADERS, 'Mcp-Session-Id': randomUUID() },
        body: pingBody,
      });
      if (status === 429) limited++;
      else passed++;
    }
    expect(passed).toBe(10);
    expect(limited).toBe(990);
  }, 60_000);

  it('does not let a session id shaped like an address key spend another client budget', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      trustProxy: 'loopback',
      rateLimitRpm: 2,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // 203.0.113.1 sends a session header naming 203.0.113.2's address key.
    const attackerStatuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          ...MCP_ACCEPT_HEADERS,
          'X-Forwarded-For': '203.0.113.1',
          'Mcp-Session-Id': 'ip:203.0.113.2',
        },
        body: pingBody,
      });
      attackerStatuses.push(status);
    }
    // The sender is limited in its own bucket.
    expect(attackerStatuses[2]).toBe(429);

    // The other client (203.0.113.2) still has its full budget.
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { ...MCP_ACCEPT_HEADERS, 'X-Forwarded-For': '203.0.113.2' },
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
    expect(status).toBe(200);
  });

  it('keeps a separate rate-limit window for a live session', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      rateLimitRpm: 2,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    // initialize: address window count 1
    const sessionId = await initSession(port);

    const sessionStatuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { ...MCP_ACCEPT_HEADERS, 'Mcp-Session-Id': sessionId },
        body: pingBody,
      });
      sessionStatuses.push(status);
    }
    expect(sessionStatuses).toEqual([200, 200, 429]);

    // The address window is unaffected by the session's requests: count 2.
    await expect(initSession(port)).resolves.toBeTruthy();
  });

  it('keeps the rate-limit map bounded under many distinct client addresses', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      trustProxy: 'loopback',
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    expect(MAX_RATE_LIMIT_KEYS).toBe(10_000);
    const total = MAX_RATE_LIMIT_KEYS + 200;
    const batchSize = 100;
    let largestSeen = 0;
    for (let start = 0; start < total; start += batchSize) {
      const batch = [];
      for (let i = start; i < Math.min(start + batchSize, total); i++) {
        const address = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
        batch.push(
          fetchJson(`http://127.0.0.1:${port}/mcp`, {
            method: 'POST',
            headers: { ...MCP_ACCEPT_HEADERS, 'X-Forwarded-For': address },
            body: pingBody,
          })
        );
      }
      const responses = await Promise.all(batch);
      for (const r of responses) expect(r.status).not.toBe(429);
      largestSeen = Math.max(largestSeen, result.rateLimitKeyCount());
    }
    expect(largestSeen).toBeLessThanOrEqual(MAX_RATE_LIMIT_KEYS);
    expect(result.rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);
  }, 120_000);

  /** Address for index `i`, distinct for every i below 2^24. */
  function addressFor(i: number): string {
    return `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
  }

  async function statusFrom(port: number, address: string): Promise<number> {
    const { status } = await fetchJson(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { ...MCP_ACCEPT_HEADERS, 'X-Forwarded-For': address },
      body: pingBody,
    });
    return status;
  }

  /** Send one request from each address in [from, to), in concurrent batches. */
  async function sendFromRange(port: number, from: number, to: number): Promise<void> {
    for (let start = from; start < to; start += 100) {
      const batch = [];
      for (let i = start; i < Math.min(start + 100, to); i++) {
        batch.push(statusFrom(port, addressFor(i)));
      }
      await Promise.all(batch);
    }
  }

  it('evicts the oldest rate-limit window first when the map is full', async () => {
    const port = getPort();
    const result = await createHttpTransport({
      port,
      host: '127.0.0.1',
      trustProxy: 'loopback',
      rateLimitRpm: 1,
      serverFactory: makeServerFactory(),
    });
    cleanup = result.cleanup;

    const last = MAX_RATE_LIMIT_KEYS - 1;
    expect(await statusFrom(port, addressFor(0))).not.toBe(429);
    await sendFromRange(port, 1, last);
    expect(await statusFrom(port, addressFor(last))).not.toBe(429);
    expect(result.rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);

    // A new address at capacity evicts the oldest window (address 0).
    expect(await statusFrom(port, addressFor(MAX_RATE_LIMIT_KEYS))).not.toBe(429);
    expect(result.rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);

    // The newest earlier window is kept, so its second request is limited.
    expect(await statusFrom(port, addressFor(last))).toBe(429);
    // The evicted address restarts with a fresh window.
    expect(await statusFrom(port, addressFor(0))).not.toBe(429);
  }, 120_000);

  it('evicts an expired window before a renewed active one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(10_000_000);
      const port = getPort();
      const result = await createHttpTransport({
        port,
        host: '127.0.0.1',
        trustProxy: 'loopback',
        rateLimitRpm: 1,
        serverFactory: makeServerFactory(),
      });
      cleanup = result.cleanup;

      expect(await statusFrom(port, addressFor(0))).not.toBe(429);
      await sendFromRange(port, 1, MAX_RATE_LIMIT_KEYS);
      expect(result.rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);

      // Every window has expired; address 0 starts a new, active window.
      vi.setSystemTime(10_000_000 + 61_000);
      expect(await statusFrom(port, addressFor(0))).not.toBe(429);

      // A new address at capacity evicts an expired window, not address 0's.
      expect(await statusFrom(port, addressFor(MAX_RATE_LIMIT_KEYS))).not.toBe(429);
      expect(result.rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);
      expect(await statusFrom(port, addressFor(0))).toBe(429);
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});

describe('rateLimitKeyFor', () => {
  it('keys a session header shaped like an address key by the real client address', () => {
    expect(rateLimitKeyFor('ip:10.0.0.2', '10.0.0.1', () => false)).toBe('ip:10.0.0.1');
  });

  it('keys a valid id of a live session by session', () => {
    const id = randomUUID();
    expect(rateLimitKeyFor(id, '10.0.0.1', (candidate) => candidate === id)).toBe(`session:${id}`);
  });

  it('keys a valid but unknown session id by client address', () => {
    expect(rateLimitKeyFor(randomUUID(), '10.0.0.1', () => false)).toBe('ip:10.0.0.1');
  });

  it('keys a request without a session id by client address', () => {
    expect(rateLimitKeyFor(undefined, '10.0.0.1', () => true)).toBe('ip:10.0.0.1');
  });

  it('keys a malformed session id by client address', () => {
    const isLive = vi.fn(() => true);
    expect(rateLimitKeyFor('', '10.0.0.1', isLive)).toBe('ip:10.0.0.1');
    expect(rateLimitKeyFor('has space', '10.0.0.1', isLive)).toBe('ip:10.0.0.1');
    expect(rateLimitKeyFor('x'.repeat(129), '10.0.0.1', isLive)).toBe('ip:10.0.0.1');
    expect(isLive).not.toHaveBeenCalled();
  });
});
