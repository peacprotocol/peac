# HTTP Transport Security Checklist

> Deployer-facing guidance for running `@peac/mcp-server` with `--transport http` in production.
> Updated for v0.11.0 (unprotected mode).

## Pre-deployment

- [ ] **TLS termination**: place the server behind a TLS-terminating reverse proxy (nginx, Caddy, cloud load balancer). The server binds plaintext HTTP; TLS is the deployer's responsibility.
- [ ] **Bind address**: do not use `--host 0.0.0.0` unless behind a reverse proxy. The default `127.0.0.1` restricts to localhost.
- [ ] **Authentication**: v0.11.0 runs in unprotected mode (no token validation). Enforce authentication at the reverse proxy or API gateway layer before forwarding to the MCP server.
- [ ] **Trust-proxy**: only set `--trust-proxy` when behind a trusted reverse proxy. Options: `loopback` (127.0.0.0/8), `linklocal` (adds 169.254.0.0/16), `private` (adds RFC 1918), or explicit IPs. Never use `all` in production.

## Network boundaries

- [ ] **CORS origins**: deny all by default. Use `--cors-origins` to allow specific browser-based clients.
- [ ] **Rate limiting**: default 100 req/min per session. Adjust via policy `limits.rate_limit_rpm` for high-throughput environments. Layer additional rate limiting at the reverse proxy for defense in depth.
- [ ] **Request size**: default 1MB body limit. Adjust via policy `limits.max_request_bytes` if clients send large evidence payloads.
- [ ] **Session limits**: default 100 concurrent sessions, 30-minute TTL. Tune `maxSessions` and `sessionTtlMs` based on expected client count.

## Session management

- [ ] **Session isolation**: each HTTP session gets its own `McpServer` + transport instance. This is the primary defense against CVE-2026-25536 (cross-client data leak). Do not attempt to share server instances across sessions.
- [ ] **Session eviction**: stale sessions are evicted after TTL expiry. Monitor session count via health endpoint if scaling.
- [ ] **Session ID**: server-generated UUIDs (visible ASCII 0x21-0x7E). Clients must include `Mcp-Session-Id` on all requests after initialization.

## Authorization (OAuth readiness)

- [ ] **PRM endpoint**: configure `--authorization-servers` and `--public-url` only if you have a deployed OAuth 2.1 authorization server. The PRM endpoint advertises the authorization server for client discovery (RFC 9728).
- [ ] **Token validation**: not implemented in v0.11.0. Full protected mode (401 + WWW-Authenticate + token validation) ships in a future release.

## Monitoring

- [ ] **Health endpoint**: `GET /health` returns `{ ok, version, protocolVersion }` without authentication. Use for load balancer health checks.
- [ ] **Logging**: server startup banner prints to stderr with configuration summary. Redirect stderr to a log aggregator in production.

## SDK version

- [ ] **MCP SDK >= 1.26.0**: required for CVE-2026-25536 fix. Current pin: `~1.27.0`. Do not downgrade below 1.26.0.
