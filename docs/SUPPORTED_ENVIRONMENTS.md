# Supported Environments

**Last verified:** 2026-06 documentation review. Environment claims are substantiated by CI lanes in `.github/workflows/ci.yml` (Node 22/24/25 matrix, Go SDK lane) and by the `.node-version` (Node 24 canonical) and `sdks/go/go.mod` (Go 1.26) pins. Node floor is `>=22.13.0`.

## Node.js

| Version                      | Status            | Notes                                                           |
| ---------------------------- | ----------------- | --------------------------------------------------------------- |
| Node.js 24 (Active LTS)      | **Required**      | Canonical development and CI lane. `.node-version` pinned here. |
| Node.js 22 (Maintenance LTS) | **Compatibility** | `engines.node >= 22.13.0` floor. CI compat lane.                |
| Node.js 25+                  | **Advisory**      | Forward-compat CI lane. Not guaranteed.                         |

## Go

| Version  | Status        | Notes                                                                                                                                                            |
| -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go 1.26+ | **Supported** | `sdks/go/`: Interaction Record (`interaction-record+jwt`) `Issue()` and `VerifyLocal()` with Ed25519, RFC 8785 JCS, and JOSE hardening. Middleware experimental. |

## Python

| Version      | Status            | Notes                                                                                                                              |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Python 3.12+ | **Examples only** | API-first examples using Hosted Verify / reference verifier (`examples/python/`, `requires-python = ">=3.12"`). No native SDK yet. |

## Browser and Edge Runtimes

| Runtime            | Status        | Notes                                                 |
| ------------------ | ------------- | ----------------------------------------------------- |
| Modern browsers    | **Partial**   | `@peac/schema` (validation, no network). Verifier UI. |
| Cloudflare Workers | **Supported** | `surfaces/workers/cloudflare/`                        |
| Fastly Compute     | **Supported** | `surfaces/workers/fastly/`                            |
| Akamai EdgeWorkers | **Supported** | `surfaces/workers/akamai/`                            |

## Server Frameworks

| Framework    | Status           | Package                             |
| ------------ | ---------------- | ----------------------------------- |
| Express      | **Supported**    | `@peac/middleware-express`          |
| Hono         | **Supported**    | `apps/api` (Hono-based HTTP server) |
| Next.js Edge | **Experimental** | `surfaces/nextjs/middleware/`       |

## Language Strategy

- **TypeScript/Node.js** is the canonical OSS implementation path
- **Go** has core Wire 0.2 parity for Interaction Record issue/verify; middleware remains experimental
- **Hosted Verify and Hosted Issue** serve as the language-agnostic entry point via OpenAPI
- **Python** receives API-first support before any full SDK commitment
