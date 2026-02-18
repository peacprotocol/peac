# @peac/mcp-server

Offline trust utilities for AI agents -- verify, inspect, and decode PEAC receipts via MCP.

All operations run locally. No network calls, no external services, no API keys required.

## Quick Start

### 1. Add to your AI tool

**Claude Desktop** -- paste into `claude_desktop_config.json`:

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

**Cursor / Windsurf** -- paste into `.mcp.json` at project root:

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

### 2. Try it

Ask your agent to verify a receipt:

> "Verify this PEAC receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEiLCJraWQiOiJ0ZXN0In0..."

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
