# PEAC MCP Server for Codex

Install `@peac/mcp-server` as an MCP server in OpenAI Codex.

## Setup

Add the following to your Codex MCP configuration:

```json
{
  "mcpServers": {
    "peac": {
      "command": "npx",
      "args": ["-y", "@peac/mcp-server"],
      "env": {}
    }
  }
}
```

## Available Tools

| Tool                 | Description                                |
| -------------------- | ------------------------------------------ |
| `peac_verify`        | Verify a signed interaction record         |
| `peac_inspect`       | Inspect JWS structure without verification |
| `peac_decode`        | Decode and display receipt claims          |
| `peac_issue`         | Issue a signed interaction record          |
| `peac_create_bundle` | Create an evidence bundle                  |

## Requirements

- Node.js >= 22.0.0
- npm (for `npx`)
