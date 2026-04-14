# Claude Code / Claude Desktop Quickstart

Install the PEAC Protocol MCP server in Claude Code (or Claude Desktop)
and verify a sample Interaction Record offline in under five minutes.
The two surfaces share the same `.mcp.json` shape, so one config works
for both.

## Prerequisites

- Claude Code (or Claude Desktop) installed.
- Node.js 22 or newer (`node -v`).

## Install

1. Clone this repo (or download `surfaces/plugin-pack/claude-code/`).
2. Copy `surfaces/plugin-pack/claude-code/.mcp.json` to your project
   root, or merge its `mcpServers.peac` entry into an existing
   `.mcp.json`. For Claude Desktop, paste the same entry into the
   Desktop MCP config.
3. Restart Claude. The `peac` server appears in the MCP server list on
   first tool invocation.
4. (Optional) The `peac/` directory ships three Claude Code skills
   (`SKILL.md`, `explain-receipt.md`, `verify-receipt.md`) that route
   receipt operations through the MCP tools.

## Smoke test (offline)

In a Claude chat, paste the contents of
`surfaces/plugin-pack/claude-code/peac/samples/sample-receipt.jws` and
ask Claude to inspect it. The PEAC MCP server returns the decoded
header and payload via the `peac.inspect` tool without any network
call and without an issuer key.

For a CI-runnable self-check without Claude:

```bash
node scripts/smoke-claude-code.mjs
```

The smoke script validates `.mcp.json` shape, exact-version pinning
(`@latest` forbidden), skills presence, and the sample-receipt compact-
JWS shape.

## What ships

- `.mcp.json` — MCP server configuration pinned to an exact version
  (compatible with both Claude Code and Claude Desktop).
- `peac/SKILL.md` — primary Claude Code skill.
- `peac/explain-receipt.md`, `peac/verify-receipt.md` — Claude Code
  skill files.
- `peac/samples/sample-receipt.jws` — deterministic offline receipt.

## Trust boundary

- Distribution class: Claude Code / Claude Desktop plugin bundle.
- Skills are observational; they do not mutate host state outside the
  MCP tool surface.
- Pin drift is guarded: the smoke script fails if the pinned version
  is missing or uses `@latest`.

## See also

- [Cursor quickstart](cursor-quickstart.md)
- [Codex quickstart](codex-quickstart.md)
- [PEAC Protocol MCP server](https://github.com/peacprotocol/peac/tree/main/packages/mcp-server)
