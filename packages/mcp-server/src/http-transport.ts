/**
 * MCP Streamable HTTP transport (DD-119, DD-123)
 *
 * Adds HTTP transport alongside stdio. Unprotected mode only (v0.11.0).
 * Each session gets its own McpServer + transport (CVE-2026-25536 defense).
 *
 * Endpoints:
 *   POST /mcp          JSON-RPC tool calls (requires Mcp-Session-Id after init)
 *   DELETE /mcp         Terminate session
 *   GET /health         Health check (no auth)
 *   GET /.well-known/oauth-protected-resource[/<path>]   PRM (conditional)
 *   GET /mcp            405 Method Not Allowed
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from './session-manager.js';
import { SERVER_NAME, SERVER_VERSION, MCP_PROTOCOL_VERSION } from './infra/constants.js';

/**
 * Trust-proxy configuration for X-Forwarded-For interpretation.
 *
 * Presets:
 * - 'off': never trust forwarded headers (default; safe for direct clients)
 * - 'loopback': trust only from 127.0.0.0/8 and ::1
 * - 'linklocal': trust loopback + link-local (169.254.0.0/16, fe80::/10)
 * - 'private': trust loopback + link-local + RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - 'all': trust any remote address (DISCOURAGED; use only when behind a fully trusted proxy chain)
 *
 * Explicit addresses:
 * - comma-separated IPs: trust only from listed addresses (e.g., '10.0.0.1,10.0.0.2')
 *
 * WARNING: only enable behind a trusted reverse proxy. An attacker can forge
 * X-Forwarded-For from an untrusted peer to bypass per-IP rate limiting.
 */
export type TrustProxyValue = 'off' | 'loopback' | 'linklocal' | 'private' | 'all' | string;

export interface HttpTransportOptions {
  /** Port to listen on. Default: 3000 */
  port?: number;
  /** Bind address. Default: '127.0.0.1' (localhost only) */
  host?: string;
  /** Allowed CORS origins (empty = deny all). */
  corsOrigins?: string[];
  /** OAuth authorization server URIs (enables PRM with publicUrl). */
  authorizationServers?: string[];
  /** Canonical public URL of this server (required for PRM). */
  publicUrl?: string;
  /** Trust X-Forwarded-For for rate limiting. Default: 'off' */
  trustProxy?: TrustProxyValue;
  /** Max request body bytes. Default: 1MB */
  maxRequestBytes?: number;
  /** Rate limit: requests per minute per session. Default: 100 */
  rateLimitRpm?: number;
  /** Session TTL in ms. Default: 30 min */
  sessionTtlMs?: number;
  /** Max concurrent sessions. Default: 100 */
  maxSessions?: number;
  /** Max sessions per client IP. Default: 10 */
  maxSessionsPerIp?: number;
  /** Factory to create new McpServer instances (one per session) */
  serverFactory: () => McpServer;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576; // 1 MB
const DEFAULT_RATE_LIMIT_RPM = 100;
const MAX_SESSION_ID_LENGTH = 128;

/**
 * Validate Mcp-Session-Id: visible ASCII (0x21-0x7E), max 128 chars.
 * MCP spec requires session IDs to be visible ASCII characters only.
 */
function isValidSessionId(id: string): boolean {
  if (id.length === 0 || id.length > MAX_SESSION_ID_LENGTH) return false;
  for (let i = 0; i < id.length; i++) {
    const code = id.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

/**
 * Check if an IPv4 address falls within a well-known range.
 * Does NOT perform CIDR parsing; uses prefix matching for known ranges.
 */
function isLoopbackAddr(addr: string): boolean {
  return addr.startsWith('127.') || addr === '::1' || addr === '::ffff:127.0.0.1';
}
function isLinkLocalAddr(addr: string): boolean {
  if (isLoopbackAddr(addr)) return true;
  return addr.startsWith('169.254.') || addr.startsWith('fe80');
}
function isPrivateAddr(addr: string): boolean {
  if (isLinkLocalAddr(addr)) return true;
  return (
    addr.startsWith('10.') ||
    addr.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(addr) ||
    addr.startsWith('fc') ||
    addr.startsWith('fd') ||
    addr.startsWith('::ffff:10.') ||
    addr.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(addr)
  );
}

/**
 * Check if a remote address is a trusted proxy based on trust-proxy config.
 */
function isTrustedProxy(remoteAddr: string, trustProxy: TrustProxyValue): boolean {
  if (trustProxy === 'off') return false;
  if (trustProxy === 'all') return true;
  if (trustProxy === 'loopback') return isLoopbackAddr(remoteAddr);
  if (trustProxy === 'linklocal') return isLinkLocalAddr(remoteAddr);
  if (trustProxy === 'private') return isPrivateAddr(remoteAddr);
  // Comma-separated trusted IPs
  const trusted = trustProxy.split(',').map((s) => s.trim());
  return trusted.includes(remoteAddr);
}

/**
 * Validate --public-url for RFC 9728 PRM correctness:
 * - Must be https (unless loopback for dev ergonomics)
 * - Must not contain fragments
 * - Trailing slashes normalized
 */
function validatePublicUrl(rawUrl: string): { url: URL; normalized: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { error: `Invalid URL: ${rawUrl}` };
  }
  if (u.hash) {
    return { error: 'Public URL must not contain fragments (#)' };
  }
  const isLoopback =
    u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  if (u.protocol !== 'https:' && !isLoopback) {
    return { error: 'Public URL must use https (except for localhost/loopback dev usage)' };
  }
  // Normalize: strip trailing slash for path matching consistency
  const normalized = u.href.replace(/\/+$/, '') || u.origin;
  return { url: u, normalized };
}

/**
 * Create and start an HTTP server for MCP Streamable HTTP transport.
 * Returns a cleanup function to shut everything down.
 */
export async function createHttpTransport(
  options: HttpTransportOptions
): Promise<{ cleanup: () => Promise<void> }> {
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';
  const corsOrigins = new Set(options.corsOrigins ?? []);
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const rateLimitRpm = options.rateLimitRpm ?? DEFAULT_RATE_LIMIT_RPM;

  const sessionManager = new SessionManager({
    ttlMs: options.sessionTtlMs,
    maxSessions: options.maxSessions,
    maxSessionsPerIp: options.maxSessionsPerIp,
  });
  sessionManager.startSweep();

  // Per-session + per-IP rate limiting (token bucket keyed on session ID,
  // falling back to IP for unauthenticated init requests)
  const rateLimits = new Map<string, RateLimitEntry>();

  function checkRateLimit(key: string): boolean {
    const now = Date.now();
    let entry = rateLimits.get(key);
    if (!entry || now - entry.windowStart > ONE_MINUTE_MS) {
      entry = { count: 0, windowStart: now };
      rateLimits.set(key, entry);
    }
    entry.count++;
    return entry.count <= rateLimitRpm;
  }

  const trustProxyValue: TrustProxyValue = options.trustProxy ?? 'off';

  function getClientIp(req: IncomingMessage): string {
    const remoteAddr = req.socket.remoteAddress ?? 'unknown';
    if (trustProxyValue !== 'off' && isTrustedProxy(remoteAddr, trustProxyValue)) {
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string') {
        const first = xff.split(',')[0]?.trim();
        if (first) return first;
      }
    }
    return remoteAddr;
  }

  // Allowed hosts for Host header validation
  const allowedHosts = new Set<string>();
  allowedHosts.add(`${host}:${port}`);
  allowedHosts.add(host === '0.0.0.0' ? `localhost:${port}` : `${host}:${port}`);
  if (host === '127.0.0.1' || host === '0.0.0.0') {
    allowedHosts.add(`localhost:${port}`);
    allowedHosts.add(`127.0.0.1:${port}`);
  }
  if (options.publicUrl) {
    try {
      const u = new URL(options.publicUrl);
      allowedHosts.add(u.host);
    } catch {
      // Invalid publicUrl, ignore
    }
  }

  // Origin allowlist for DNS rebinding defense (MCP spec MUST requirement)
  const allowedOrigins = new Set<string>(corsOrigins);

  function validateOrigin(req: IncomingMessage, res: ServerResponse): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // No origin = same-origin or non-browser
    if (allowedOrigins.size === 0) {
      // Deny all cross-origin by default
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return false;
    }
    if (!allowedOrigins.has(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return false;
    }
    return true;
  }

  function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, GET, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Mcp-Session-Id, Accept, MCP-Protocol-Version'
      );
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    }
  }

  function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(json);
  }

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += (chunk as Buffer).length;
      if (totalBytes > maxRequestBytes) {
        throw new Error(`Request body exceeds ${maxRequestBytes} bytes`);
      }
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  // PRM configuration (RFC 9728 path-aware discovery)
  // Both authorizationServers (non-empty) and publicUrl are required for PRM.
  const authServers = (options.authorizationServers ?? []).filter((s) => s.trim().length > 0);
  if (options.authorizationServers?.length && authServers.length === 0) {
    process.stderr.write(
      `[${SERVER_NAME}] WARNING: --authorization-servers contains only empty entries, PRM disabled\n`
    );
  }
  if (authServers.length > 0 && !options.publicUrl) {
    process.stderr.write(
      `[${SERVER_NAME}] WARNING: --authorization-servers set without --public-url, PRM disabled\n`
    );
  }
  if (options.publicUrl && authServers.length === 0) {
    process.stderr.write(
      `[${SERVER_NAME}] WARNING: --public-url set without --authorization-servers, PRM disabled\n`
    );
  }
  const prmEnabled = !!(authServers.length > 0 && options.publicUrl);
  let prmPath = '/.well-known/oauth-protected-resource';
  let prmDocument: object | undefined;
  if (prmEnabled && options.publicUrl) {
    const validation = validatePublicUrl(options.publicUrl);
    if ('error' in validation) {
      process.stderr.write(
        `[${SERVER_NAME}] WARNING: --public-url invalid, PRM disabled: ${validation.error}\n`
      );
    } else {
      const { url: u, normalized } = validation;
      // RFC 9728 path insertion: /.well-known/oauth-protected-resource/<resource-path>
      const resourcePath = u.pathname.replace(/\/+$/, '');
      if (resourcePath && resourcePath !== '/') {
        prmPath = `/.well-known/oauth-protected-resource${resourcePath}`;
      }
      prmDocument = {
        resource: normalized,
        authorization_servers: authServers,
      };
    }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // Node.js server timeouts (slowloris defense)
    // These are set per-request since createServer options apply globally
    res.setTimeout(30_000);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      setCorsHeaders(req, res);
      res.writeHead(204);
      res.end();
      return;
    }

    setCorsHeaders(req, res);

    // Host header validation
    const hostHeader = req.headers.host;
    if (hostHeader && !allowedHosts.has(hostHeader)) {
      sendJson(res, 400, { error: 'Invalid Host header' });
      return;
    }

    // Origin validation (DNS rebinding defense)
    if (!validateOrigin(req, res)) return;

    // --- Health endpoint ---
    if (pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        version: SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
      });
      return;
    }

    // --- PRM endpoint ---
    if (pathname === prmPath && req.method === 'GET') {
      if (prmEnabled && prmDocument) {
        sendJson(res, 200, prmDocument);
      } else {
        sendJson(res, 404, { error: 'Not found' });
      }
      return;
    }

    // --- MCP endpoint ---
    if (pathname === '/mcp') {
      // GET /mcp -> 405 (SSE streaming deferred)
      if (req.method === 'GET') {
        res.writeHead(405, { Allow: 'POST, DELETE', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST for JSON-RPC requests.' }));
        return;
      }

      // DELETE /mcp -> terminate session
      if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId) {
          sendJson(res, 400, { error: 'Missing Mcp-Session-Id header' });
          return;
        }
        if (!isValidSessionId(sessionId)) {
          sendJson(res, 400, {
            error: 'Invalid Mcp-Session-Id: must be visible ASCII (0x21-0x7E), max 128 chars',
          });
          return;
        }
        const terminated = await sessionManager.terminateSession(sessionId);
        if (terminated) {
          sendJson(res, 200, { ok: true });
        } else {
          sendJson(res, 404, { error: 'Session not found or already terminated' });
        }
        return;
      }

      // POST /mcp -> JSON-RPC
      if (req.method === 'POST') {
        // Rate limit check
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        const rateLimitKey = sessionId ?? `ip:${getClientIp(req)}`;
        if (!checkRateLimit(rateLimitKey)) {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
          res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
          return;
        }

        // Read and parse body
        let body: unknown;
        try {
          const raw = await readBody(req);
          body = JSON.parse(raw.toString('utf-8'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid request body';
          sendJson(res, 400, { error: msg });
          return;
        }

        // Check if this is an initialization request
        const isInit =
          typeof body === 'object' &&
          body !== null &&
          'method' in body &&
          (body as { method: string }).method === 'initialize';

        if (isInit) {
          // MCP-Protocol-Version validation (on init)
          const protocolVersion = req.headers['mcp-protocol-version'] as string | undefined;
          if (
            protocolVersion &&
            protocolVersion !== MCP_PROTOCOL_VERSION &&
            protocolVersion !== '2025-03-26'
          ) {
            sendJson(res, 400, { error: `Unsupported MCP protocol version: ${protocolVersion}` });
            return;
          }

          // Accept header tolerance
          const accept = req.headers.accept;
          if (!accept) {
            process.stderr.write(
              `[${SERVER_NAME}] Warning: missing Accept header on init request\n`
            );
          }

          // Create new session
          let entry;
          try {
            entry = await sessionManager.createSession(options.serverFactory, getClientIp(req));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create session';
            sendJson(res, 503, { error: msg });
            return;
          }

          // Delegate to transport (it will set Mcp-Session-Id header)
          await entry.transport.handleRequest(req, res, body);
          return;
        }

        // Non-init requests require Mcp-Session-Id
        if (!sessionId) {
          sendJson(res, 400, { error: 'Missing Mcp-Session-Id header' });
          return;
        }
        if (!isValidSessionId(sessionId)) {
          sendJson(res, 400, {
            error: 'Invalid Mcp-Session-Id: must be visible ASCII (0x21-0x7E), max 128 chars',
          });
          return;
        }

        const entry = sessionManager.getSession(sessionId);
        if (!entry) {
          sendJson(res, 404, { error: 'Session not found or terminated' });
          return;
        }

        // Delegate to session's transport
        await entry.transport.handleRequest(req, res, body);
        return;
      }

      // Other methods on /mcp
      res.writeHead(405, { Allow: 'POST, DELETE', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    // --- Not found ---
    sendJson(res, 404, { error: 'Not found' });
  });

  // Node.js server timeouts (slowloris defense)
  server.headersTimeout = 10_000; // 10s for headers
  server.requestTimeout = 30_000; // 30s for full request
  server.keepAliveTimeout = 5_000; // 5s keep-alive

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      process.stderr.write(`[${SERVER_NAME}] HTTP transport listening on http://${host}:${port}\n`);
      process.stderr.write(`  Transport: Streamable HTTP (MCP 2025-06-18)\n`);
      process.stderr.write(
        `  Auth: unprotected (readiness only; authorization per MCP 2025-11-25)\n`
      );
      process.stderr.write(`  Endpoints: POST /mcp, DELETE /mcp, GET /health\n`);
      if (prmEnabled) {
        process.stderr.write(`  PRM: GET ${prmPath}\n`);
      }
      process.stderr.write(
        `  Sessions: max ${options.maxSessions ?? 100} (${options.maxSessionsPerIp ?? 10}/IP), TTL ${(options.sessionTtlMs ?? 1_800_000) / 1000}s\n`
      );
      process.stderr.write(`  Rate limit: ${rateLimitRpm} req/min per session\n`);
      process.stderr.write(
        `  CORS: ${corsOrigins.size > 0 ? [...corsOrigins].join(', ') : 'deny all'}\n`
      );
      process.stderr.write(`  Mode: unprotected (no auth enforcement)\n`);

      resolve({
        cleanup: async () => {
          await sessionManager.cleanup();
          await new Promise<void>((res) => server.close(() => res()));
        },
      });
    });
  });
}
