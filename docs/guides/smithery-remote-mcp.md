# Smithery Remote MCP Deployment

Deploy the PEAC Protocol MCP server as a Smithery-compatible remote
endpoint. The canonical Smithery configuration lives alongside the
MCP server package at `packages/mcp-server/smithery.yaml`. The
documentation and smoke harness under
`surfaces/plugin-pack/smithery/` reference that single source of
truth.

## Prerequisites

- Node.js 22 or newer.
- A hosting platform that can front HTTPS to a Node.js process
  (Cloudflare Workers, Fly.io, self-managed container, etc.).
- An Ed25519 JWK for issuance (optional if read-only tools are the
  only surface needed).

## Deploy

1. Provision your host to run:
   ```text
   npx -y @peac/mcp-server@0.12.11 --issuer-key env:PEAC_ISSUER_KEY \
     --issuer-id https://your-service.example.com
   ```
   The pinned version tracks the canonical `smithery.yaml`; update
   both on each PEAC release.
2. Expose the MCP Streamable HTTP transport on an HTTPS endpoint.
3. Terminate TLS and apply rate limits at the edge (reverse proxy).
   The PEAC server does not include its own rate limiter for the
   remote transport.

## Smoke test (local, offline)

```bash
node scripts/smoke-smithery.mjs
```

Validates the canonical `packages/mcp-server/smithery.yaml` shape,
exact-version pinning (`@latest` forbidden), and the sample receipt
under `surfaces/plugin-pack/smithery/samples/`. No network call and
no live endpoint required.

## Directory submission (manual ops)

Submission to the Smithery directory is performed by a maintainer
outside this repo and recorded in the private operations log. The
submission reuses `packages/mcp-server/smithery.yaml`; no repo-facing
change is required.

## Trust boundary

- Distribution class: Community-unreviewed (Smithery is open-submission;
  directory review is operator-owned).
- Pin drift is guarded by `scripts/smoke-smithery.mjs`.
- The PEAC MCP server uses per-session transport isolation (DD-119).
  Callers MUST terminate TLS and rate-limit at the edge.

## See also

- Canonical config: `packages/mcp-server/smithery.yaml`
- Existing README: `surfaces/plugin-pack/smithery/README.md`
- [GitHub Copilot enterprise registry guide](copilot-enterprise-registry.md)
