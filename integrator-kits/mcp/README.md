# PEAC Integration Kit: Model Context Protocol (MCP)

Integration guide for adding PEAC receipt operations to MCP servers and clients.

## Status

Integration kit: expanding to full guide with working code examples (v0.12.3). The `@peac/mcp-server` and `@peac/mappings-mcp` packages are published and stable.

## Quick Start

```bash
npx -y @peac/mcp-server --help
```

The MCP server provides 5 tools: `peac_verify`, `peac_inspect`, `peac_decode`, `peac_issue`, `peac_create_bundle`. Read-only operations require no configuration.

See [examples/mcp-tool-call](../../examples/mcp-tool-call/) for a working MCP receipt example.

## Reference

- `@peac/mcp-server`: PEAC receipt operations as MCP tools (verify, inspect, decode, issue, bundle)
- `@peac/mappings-mcp`: MCP carrier adapter for receipt metadata in `_meta`
- MCP specification: https://modelcontextprotocol.io
