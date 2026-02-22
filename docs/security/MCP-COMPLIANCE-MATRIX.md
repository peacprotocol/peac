# MCP Streamable HTTP Compliance Matrix

> Anchored to MCP specification revisions: Transport (2025-06-18), Authorization (2025-11-25).
> Each requirement maps to a specific test file and test name for traceability.

## Transport (MCP 2025-06-18)

| #   | Requirement                                        | Level         | Status   | Test                                                                                    |
| --- | -------------------------------------------------- | ------------- | -------- | --------------------------------------------------------------------------------------- |
| T1  | POST /mcp returns JSON-RPC response                | MUST          | Covered  | `http-transport.test.ts` > "should return 400 for non-init POST without session ID"     |
| T2  | POST /mcp notification returns 202 Accepted        | SHOULD        | Deferred | SSE streaming deferred; JSON-only mode                                                  |
| T3  | GET /mcp returns 405 Method Not Allowed            | MUST          | Covered  | `http-transport.test.ts` > "should return 405 for GET /mcp"                             |
| T4  | Accept header: application/json, text/event-stream | MUST (client) | Tolerant | Server logs warning but does not reject missing Accept                                  |
| T5  | MCP-Protocol-Version header validation             | MUST          | Covered  | `http-transport.test.ts` > "should return 400 for unsupported MCP protocol version"     |
| T6  | Missing MCP-Protocol-Version assumes 2025-03-26    | SHOULD        | Covered  | Implicit in init tests that omit the header                                             |
| T7  | Mcp-Session-Id returned on initialization          | MUST          | Covered  | `http-transport.test.ts` > session lifecycle tests                                      |
| T8  | Mcp-Session-Id required on subsequent requests     | MUST          | Covered  | `http-transport.test.ts` > "should return 400 for non-init POST without session ID"     |
| T9  | Mcp-Session-Id: visible ASCII (0x21-0x7E)          | MUST          | Covered  | `http-transport.test.ts` > "should reject session ID with non-visible ASCII characters" |
| T10 | Unknown Mcp-Session-Id returns 404                 | MUST          | Covered  | `http-transport.test.ts` > "should return 404 for unknown session ID"                   |
| T11 | DELETE /mcp terminates session                     | MUST          | Covered  | `http-transport.test.ts` > "should handle DELETE /mcp with unknown session ID"          |
| T12 | DELETE /mcp without session ID returns 400         | MUST          | Covered  | `http-transport.test.ts` > "should return 400 for DELETE without session ID"            |
| T13 | SSE streaming within Streamable HTTP               | MAY           | Deferred | JSON-only responses (spec-compliant; SSE is optional)                                   |

## Security (DD-123)

| #   | Requirement                                 | Level  | Status    | Test                                                                      |
| --- | ------------------------------------------- | ------ | --------- | ------------------------------------------------------------------------- |
| S1  | Origin validation (DNS rebinding defense)   | MUST   | Covered   | `http-transport.test.ts` > "should deny cross-origin requests by default" |
| S2  | CORS deny-all by default                    | MUST   | Covered   | `http-transport.test.ts` > "should deny cross-origin requests by default" |
| S3  | CORS opt-in via --cors-origins              | SHOULD | Covered   | `http-transport.test.ts` > "should allow configured CORS origins"         |
| S4  | Request body size limit (1MB default)       | MUST   | Covered   | `http-transport.test.ts` > "should reject oversized request bodies"       |
| S5  | Per-session + per-IP rate limiting          | MUST   | Covered   | `http-transport.test.ts` > "should not trust X-Forwarded-For by default"  |
| S6  | Default bind to 127.0.0.1 (localhost only)  | MUST   | Covered   | All tests bind to 127.0.0.1                                               |
| S7  | Host header validation                      | MUST   | Covered   | `http-transport.test.ts` > host validation in request handling            |
| S8  | Node.js server timeouts (slowloris defense) | SHOULD | Covered   | Configured in `createHttpTransport()`                                     |
| S9  | No redirect following (SSRF prevention)     | MUST   | By design | No outbound HTTP from transport                                           |

## Session Isolation (CVE-2026-25536)

| #   | Requirement                       | Level  | Status  | Test                                                                                             |
| --- | --------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------ |
| C1  | Per-session McpServer instance    | MUST   | Covered | `session-manager.test.ts` > "should create multiple isolated sessions"                           |
| C2  | Per-session transport instance    | MUST   | Covered | `session-manager.test.ts` > "should create multiple isolated sessions"                           |
| C3  | No shared state between sessions  | MUST   | Covered | `session-manager.test.ts` > "should guarantee per-session isolation (CVE-2026-25536 regression)" |
| C4  | Session eviction on TTL expiry    | SHOULD | Covered | `session-manager.test.ts` > "should evict stale sessions on TTL expiry"                          |
| C5  | Max session capacity limit        | SHOULD | Covered | `session-manager.test.ts` > "should enforce max session limit"                                   |
| C6  | MCP SDK >= 1.26.0 (patched range) | MUST   | Covered | `package.json` pins `~1.27.0`                                                                    |

## Authorization (MCP 2025-11-25)

| #   | Requirement                                 | Level          | Status   | Test                                                                     |
| --- | ------------------------------------------- | -------------- | -------- | ------------------------------------------------------------------------ |
| A1  | RFC 9728 PRM when configured                | MUST (if auth) | Covered  | `http-transport.test.ts` > "should serve PRM when configured"            |
| A2  | PRM includes authorization_servers          | MUST (if PRM)  | Covered  | `http-transport.test.ts` > PRM response assertions                       |
| A3  | PRM path-aware routing                      | MUST (if PRM)  | Covered  | `http-transport.test.ts` > "should serve PRM at path-aware location"     |
| A4  | PRM 404 when unconfigured                   | MUST           | Covered  | `http-transport.test.ts` > "should return 404 for PRM when unconfigured" |
| A5  | Public URL validation (https, no fragments) | SHOULD         | Covered  | `http-transport.test.ts` > "should reject public-url with fragment"      |
| A6  | Protected mode (401 + WWW-Authenticate)     | MUST (if auth) | Deferred | Unprotected mode only in v0.11.0                                         |
| A7  | Token validation                            | MUST (if auth) | Deferred | Deployer-provided auth via reverse proxy                                 |

## Intentional Deviations (documented)

1. **GET /mcp returns 405, not SSE**: JSON-only mode is spec-compliant. SSE streaming is an optional mechanism within Streamable HTTP that can be added without protocol changes.
2. **Authorization is optional**: MCP spec allows unprotected mode. v0.11.0 ships "OAuth readiness" (PRM discovery hooks) without implementing the full authorization server.
3. **Accept header tolerance**: Spec says clients MUST include Accept header, but we do not reject requests missing it (tolerant server behavior).
