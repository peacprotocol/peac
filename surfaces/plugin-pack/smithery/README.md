# PEAC MCP Server on Smithery

Install `@peac/mcp-server` via the Smithery registry.

## Current Transport

The Smithery configuration uses **stdio transport** (local install via npm/npx). Streamable HTTP transport is planned for a future release.

## Validation

Run the Smithery validation script to verify the configuration:

```bash
node scripts/validate-smithery.mjs
```

This checks: YAML structure, `commandFunction` evaluation with empty and full configs, config properties, and example config presence.

## Configuration

See `packages/mcp-server/smithery.yaml` for the full Smithery configuration including `configSchema` and `commandFunction`.
