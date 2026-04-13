# Compatibility Matrix

Current as of v0.12.9.

## Wire Format Support

| Surface                    | Wire 0.2 (`interaction-record+jwt`)                                 | Wire 0.1 (`peac-receipt/0.1`)                                        | Status                                                         |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `@peac/protocol` (TS/Node) | Full: `issue()` + `verifyLocal()`                                   | Legacy verify only (`verifyLocalWire01()`, not exported from barrel) | **default**                                                    |
| `@peac/crypto` (TS/Node)   | Full: dual-stack sign/verify/decode                                 | Decode and verify only                                               | **default**                                                    |
| `@peac/schema` (TS/Node)   | Full: `Wire02ClaimsSchema`, extension groups, type enforcement      | Legacy `ReceiptClaimsSchema`                                         | **default**                                                    |
| `@peac/cli`                | Full                                                                | -                                                                    | **default**                                                    |
| `@peac/mcp-server`         | Full (5 tools)                                                      | -                                                                    | **default**                                                    |
| `@peac/middleware-express` | Full                                                                | -                                                                    | **default**                                                    |
| Go SDK (`sdks/go/`)        | Full: `Issue()` + `VerifyLocal()` + JCS (22 cross-language vectors) | Legacy verify only                                                   | **supported** (core issue/verify); middleware **experimental** |
| Python                     | API-first via reference verifier (httpx examples, `>=3.12`)         | -                                                                    | **examples only**                                              |
| `@peac/core`               | -                                                                   | Full (Wire 0.9 locked)                                               | **deprecated** (removal: v0.13.0)                              |
| `@peac/sdk`                | -                                                                   | Full (Wire 0.1)                                                      | **archived** (use `@peac/protocol`)                            |

## Runtime Environments

| Environment                  | Status            | Notes                                                                  |
| ---------------------------- | ----------------- | ---------------------------------------------------------------------- |
| Node.js 24 (Active LTS)      | **Required**      | Canonical development and CI lane                                      |
| Node.js 22 (Maintenance LTS) | **Compatibility** | `engines.node >= 22.0.0` floor                                         |
| Node.js 25+                  | **Advisory**      | Forward-compat CI lane                                                 |
| Go 1.26+                     | **Default**       | Interaction Record format (core issue/verify); middleware experimental |
| Browser / Edge runtime       | **Partial**       | `@peac/schema` (no-network), verifier UI, worker surfaces              |

## Hosted Services

| Service                                           | Status                    | Endpoint                                                                                                                                                  |
| ------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference Verifier (`POST /v1/verify`)            | **Operational** (v0.12.9) | `POST /v1/verify` (RFC 9457, OpenAPI 3.1, content negotiation: `application/json`, `application/peac-report+json`, `text/plain`; `PEAC-Report-Id` header) |
| Reference Issuer Health (`GET /v1/issuer-health`) | **Operational** (v0.12.9) | `GET /v1/issuer-health?issuer=<url>` (SSRF-safe, independent rate limit, cached)                                                                          |
| Hosted Issue (`POST /v1/issue`)                   | **Alpha** (v0.12.8)       | Disabled by default; BYO-key, provisional                                                                                                                 |

## Adapters and Mappings

All adapter and mapping packages support Wire 0.2 exclusively. See `REPO_SURFACE_STATUS.json` for the full list with per-package state.

| Adapter                        | Coverage                                      | Since   | Status      |
| ------------------------------ | --------------------------------------------- | ------- | ----------- |
| `@peac/adapter-managed-agents` | 6 event families, session summary             | v0.12.9 | **Shipped** |
| `@peac/adapter-x402`           | 4-layer verification, dual-header, V2 support | v0.12.1 | **Shipped** |
| `@peac/adapter-eat`            | COSE_Sign1, Ed25519, privacy-first mapping    | v0.12.0 | **Shipped** |
| `@peac/adapter-did`            | did:key, did:web, DID Document resolver       | v0.12.6 | **Shipped** |

### Planned (v0.12.10)

| Adapter                            | Coverage                                                            | Target   |
| ---------------------------------- | ------------------------------------------------------------------- | -------- |
| `@peac/adapter-runtime-governance` | 6 observation-specific type URIs, AGT first mapper, session summary | v0.12.10 |

## Deprecation Schedule

| Surface                   | Deprecated since | Removal target           | Migration                                                               |
| ------------------------- | ---------------- | ------------------------ | ----------------------------------------------------------------------- |
| `@peac/core`              | v0.10.0          | v0.13.0                  | Use `@peac/kernel` + `@peac/schema` + `@peac/crypto` + `@peac/protocol` |
| `@peac/sdk`               | v0.12.7          | v0.13.0                  | Use `@peac/protocol` directly                                           |
| API `/verify` endpoint    | v0.12.7          | v0.13.0 (or Nov 1, 2026) | Use `/api/v1/verify`                                                    |
| `apps/bridge`             | v0.12.7          | v0.13.0                  | Use `@peac/protocol` or `/api/v1/verify`                                |
| Wire 0.1 default teaching | v0.12.7          | Immediate                | All defaults now Wire 0.2                                               |
