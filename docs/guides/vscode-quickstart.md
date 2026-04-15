# VS Code Quickstart

Install the PEAC Protocol MCP server in VS Code (with GitHub Copilot
Chat MCP support enabled) and verify a sample Interaction Record
offline in under five minutes.

## Prerequisites

- VS Code with GitHub Copilot Chat installed and MCP support enabled
  on your Copilot plan.
- Node.js 22 or newer (`node -v`).

## Install

1. Clone this repo (or download `surfaces/plugin-pack/vscode/`).
2. Copy `surfaces/plugin-pack/vscode/mcp.json` to your workspace at
   `.vscode/mcp.json`, or merge the `servers.peac` entry into an
   existing workspace MCP config.
3. Reload VS Code. The PEAC MCP server appears in the Copilot Chat
   MCP server list on first tool invocation.

## Smoke test (offline)

In a Copilot Chat, paste the contents of
`surfaces/plugin-pack/vscode/samples/sample-receipt.jws` and ask
Copilot to inspect it. The PEAC MCP server returns the decoded header
and payload via the `peac.inspect` tool without any network call.

For a CI-runnable self-check without VS Code:

```bash
node scripts/smoke-vscode.mjs
```

The smoke script validates `mcp.json` shape (VS Code's top-level
`servers` key, not `mcpServers`), exact-version pinning (`@latest`
forbidden), and the sample-receipt compact-JWS shape.

## What ships

- `mcp.json` — VS Code / GitHub Copilot Chat MCP server configuration
  pinned to an exact version.
- `samples/sample-receipt.jws` — deterministic offline receipt.

## Trust boundary

- Distribution class: VS Code workspace MCP config (per-workspace
  scope; users opt in by placing the file in `.vscode/mcp.json`).
- Pin drift is guarded: the smoke script fails if the pinned version
  is missing or uses `@latest`.

## See also

- [Cursor quickstart](cursor-quickstart.md)
- [Claude Code / Claude Desktop quickstart](claude-code-quickstart.md)
- [PEAC Protocol MCP server](https://github.com/peacprotocol/peac/tree/main/packages/mcp-server)
