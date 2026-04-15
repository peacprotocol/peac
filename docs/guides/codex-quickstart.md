# Codex Quickstart

Install the PEAC Protocol MCP server in Codex and verify a sample
Interaction Record offline in under five minutes.

## Prerequisites

- Codex installed.
- Node.js 22 or newer (`node -v`).

## Install

1. Clone this repo (or download `surfaces/plugin-pack/codex/`).
2. Use `surfaces/plugin-pack/codex/codex-config.pinned.json` as the
   starting point for release engagements. It pins an exact
   `@peac/mcp-server` version. Merge its `mcpServers.peac` entry into
   your Codex MCP settings.
3. On first tool invocation the PEAC MCP server installs via `npx -y
@peac/mcp-server@<pinned-version>` and caches locally.

The historical `codex-config.json` (unpinned) is retained for backward
compatibility; prefer the pinned variant for new installs.

## Smoke test (offline)

Run the `verify-receipt` skill against the bundled sample at
`surfaces/plugin-pack/codex/samples/sample-receipt.jws`. The PEAC MCP
server returns the decoded JWS header and payload via the
`peac.inspect` tool without any network call.

For a CI-runnable self-check without Codex:

```bash
node scripts/smoke-codex.mjs
```

The smoke script validates both config variants, exact-version pinning
on the pinned variant (`@latest` forbidden), and the sample receipt
compact-JWS shape.

## What ships

- `codex-config.pinned.json` — pinned-version config (preferred).
- `codex-config.json` — historical unpinned variant (compat).
- `samples/sample-receipt.jws` — deterministic offline receipt.

## Trust boundary

- Distribution class: Codex plugin bundle (subject to Codex review).
- Installability smoke runs offline; no issuer key required.

## See also

- [Cursor quickstart](cursor-quickstart.md)
- [PEAC Protocol MCP server](https://github.com/peacprotocol/peac/tree/main/packages/mcp-server)
