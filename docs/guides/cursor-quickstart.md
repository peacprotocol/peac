# Cursor Quickstart

Install the PEAC Protocol MCP server in Cursor and verify a sample
Interaction Record offline in under five minutes.

## Prerequisites

- Cursor installed.
- Node.js 22 or newer (`node -v`).

## Install

1. Clone this repo (or download `surfaces/plugin-pack/cursor/`).
2. Copy `surfaces/plugin-pack/cursor/mcp.json` to your Cursor MCP
   config location, or merge the `mcpServers.peac` entry into your
   existing config.
3. (Optional) Place `surfaces/plugin-pack/cursor/peac.mdc` in your
   project so Cursor picks up the PEAC project rule.
4. Restart Cursor. Open the MCP server list and confirm `peac`
   appears.

## Smoke test (offline)

In a Cursor chat, paste the contents of
`surfaces/plugin-pack/cursor/samples/sample-receipt.jws` and ask Cursor
to inspect it. The PEAC MCP server returns the decoded header and
payload via the `peac.inspect` tool without any network call and
without an issuer key.

For a CI-runnable self-check without Cursor:

```bash
node scripts/smoke-cursor.mjs
```

The smoke script validates `mcp.json` shape, exact-version pinning
(`@latest` forbidden), the `peac.mdc` rule presence, and the sample
receipt compact-JWS shape.

## What ships

- `mcp.json` — MCP server configuration pinned to an exact version.
- `peac.mdc` — Cursor project rule.
- `samples/sample-receipt.jws` — deterministic offline receipt.

## Trust boundary

- Distribution class: Team marketplace (subject to Cursor review).
- The smoke script fails if `mcp.json` and any other tracked pack
  artifact disagree on the pinned version.
- Issuer keys and payment tokens are passed only via env var or file
  path; the rule file reinforces this convention.

## See also

- [Codex quickstart](codex-quickstart.md)
- [PEAC Protocol MCP server](https://github.com/peacprotocol/peac/tree/main/packages/mcp-server)
