# @peac/mcp-server

Verify PEAC receipts in any MCP client (Claude Desktop, Cursor, Windsurf) -- locally, offline, no API keys.

## Quick Start

### 1. Add to your AI tool

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "peac": {
      "command": "npx",
      "args": ["-y", "@peac/mcp-server"]
    }
  }
}
```

**Cursor / Windsurf** (`.mcp.json` at project root):

```json
{
  "mcpServers": {
    "peac": {
      "command": "npx",
      "args": ["-y", "@peac/mcp-server"]
    }
  }
}
```

### 2. Try it (15 seconds)

Decode a demo receipt from the command line:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"peac_decode","arguments":{"jws":"eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEiLCJraWQiOiJkZW1vIn0.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImF1ZCI6Imh0dHBzOi8vY2xpZW50LmV4YW1wbGUuY29tIiwiYW10IjoxMDAsImN1ciI6IlVTRCIsInJhaWwiOiJzdHJpcGUiLCJyZWYiOiJ0eF9kZW1vIiwiaWF0IjoxNzM5MDAwMDAwfQ.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}}}' | npx -y @peac/mcp-server 2>/dev/null | tail -1 | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d).result;console.log(JSON.stringify(r.structuredContent,null,2))})"
```

Or ask your agent directly:

> "Decode this PEAC receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMt..."

The agent will use `peac_verify` (with a public key), `peac_inspect` (metadata only), or `peac_decode` (raw header + payload) depending on context.

## Tools

| Tool           | What it does                                            | Needs key? |
| -------------- | ------------------------------------------------------- | ---------- |
| `peac_verify`  | Cryptographic signature verification + claim validation | Yes        |
| `peac_inspect` | Decode metadata without verifying signature             | No         |
| `peac_decode`  | Raw JWS header + payload dump                           | No         |

All tools are read-only, non-destructive, and idempotent.

## CLI Options

```text
peac-mcp-server [options]

Options:
  --issuer-key <ref>   Issuer signing key (env:VAR or file:/path to JWK)
  --issuer-id <uri>    Issuer identifier URI (required with --issuer-key)
  --policy <path>      Policy configuration file (JSON)
  --jwks-file <path>   JWKS file for verifier key resolution
  -V, --version        Output version number
  -h, --help           Display help
```

## Policy Configuration

Optional JSON file to customize behavior:

```json
{
  "version": "1",
  "allow_network": false,
  "redaction": {
    "strip_evidence": false,
    "strip_payment": false
  },
  "tools": {
    "peac_verify": { "enabled": true },
    "peac_inspect": { "enabled": true },
    "peac_decode": { "enabled": true }
  },
  "limits": {
    "max_jws_bytes": 16384,
    "max_response_bytes": 65536,
    "tool_timeout_ms": 30000,
    "max_concurrency": 10
  }
}
```

## Library Usage

Handlers can be used directly without the MCP server:

```typescript
import { handleVerify, getDefaultPolicy, computePolicyHash } from '@peac/mcp-server';

const policy = getDefaultPolicy();
const policyHash = await computePolicyHash(JSON.stringify(policy));

const result = await handleVerify({
  input: { jws: 'eyJ...', public_key_base64url: '...' },
  policy,
  context: {
    version: '0.10.12',
    policyHash,
    protocolVersion: '2025-11-25',
  },
});

if (result.structured.ok) {
  // Signature valid, claims verified
}
```

## MCP SDK Compatibility

This package pins `@modelcontextprotocol/sdk` to `~1.26.0` (patch-only updates). The SDK uses Zod v3.25 internally; our workspace uses Zod v3.22. The schemas are structurally compatible at runtime. If upgrading the SDK, verify tool registration still works by running `pnpm --filter @peac/mcp-server test`.

## Architecture

- **DD-51**: Pure handlers with no MCP SDK dependency
- **DD-53**: Static policy loaded once at startup with SHA-256 hash
- **DD-55**: No URLs resolved from tool inputs (SSRF prevention)
- **DD-57**: Core modules (`handlers/`, `schemas/`, `infra/`) have zero MCP SDK imports
- **DD-58**: Line-buffered stdout fence validates JSON-RPC 2.0 output

## License

Apache-2.0
