# Supported Environments

**Last verified:** v0.12.7 release cycle. Environment claims are substantiated by CI lanes in `.github/workflows/ci.yml` (Node 22/24/25 matrix, Go SDK lane).

## Node.js

| Version                      | Status            | Notes                                                           |
| ---------------------------- | ----------------- | --------------------------------------------------------------- |
| Node.js 24 (Active LTS)      | **Required**      | Canonical development and CI lane. `.node-version` pinned here. |
| Node.js 22 (Maintenance LTS) | **Compatibility** | `engines.node >= 22.0.0` floor. CI compat lane.                 |
| Node.js 25+                  | **Advisory**      | Forward-compat CI lane. Not guaranteed.                         |

## Go

| Version  | Status      | Notes                                                                |
| -------- | ----------- | -------------------------------------------------------------------- |
| Go 1.22+ | **Partial** | `sdks/go/`: Wire 0.1 issue and verify only. Wire 0.2 parity planned. |

## Python

| Version      | Status          | Notes                                                           |
| ------------ | --------------- | --------------------------------------------------------------- |
| Python 3.10+ | **Not started** | API-first support via Hosted Verify OpenAPI. No native SDK yet. |

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
- **Go** receives minimum viable Wire 0.2 parity next
- **Hosted Verify and Hosted Issue** serve as the language-agnostic front door via OpenAPI
- **Python** receives API-first support before any full SDK commitment
