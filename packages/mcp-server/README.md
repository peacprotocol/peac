# @peac/mcp-server

Verify, issue, and bundle PEAC receipts in any MCP client (Claude Desktop, Cursor, Windsurf): locally, offline, no API keys.

## Quick Start

### 1. Add to your AI tool (read-only tools)

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

### 1b. Full configuration (with issuing and bundles)

**Claude Desktop** with all tools enabled:

```json
{
  "mcpServers": {
    "peac": {
      "command": "npx",
      "args": [
        "-y",
        "@peac/mcp-server",
        "--issuer-key",
        "env:PEAC_ISSUER_KEY",
        "--issuer-id",
        "https://your-service.example.com",
        "--bundle-dir",
        "/tmp/peac-bundles",
        "--jwks-file",
        "./keys/jwks.json"
      ],
      "env": {
        "PEAC_ISSUER_KEY": "{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"d\":\"...\",\"x\":\"...\"}"
      }
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
      "args": [
        "-y",
        "@peac/mcp-server",
        "--issuer-key",
        "file:./keys/issuer.jwk",
        "--issuer-id",
        "https://your-service.example.com",
        "--bundle-dir",
        "./bundles"
      ]
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

| Tool                 | What it does                                            | Needs key? | Needs bundle-dir? |
| -------------------- | ------------------------------------------------------- | ---------- | ----------------- |
| `peac_verify`        | Cryptographic signature verification + claim validation | No\*       | No                |
| `peac_inspect`       | Decode metadata without verifying signature             | No         | No                |
| `peac_decode`        | Raw JWS header + payload dump                           | No         | No                |
| `peac_issue`         | Sign and return a PEAC receipt JWS                      | Yes        | No                |
| `peac_create_bundle` | Create a signed evidence bundle directory               | Yes        | Yes               |

\* `peac_verify` needs a public key (inline, via JWKS, or `--jwks-file`) but not an issuer key.

Privileged tools (`peac_issue`, `peac_create_bundle`) only appear in `tools/list` when the server is started with `--issuer-key` and `--issuer-id`. The bundle tool additionally requires `--bundle-dir`.

Note: stdout is reserved for JSON-RPC messages. All diagnostics, banners, and errors go to stderr.

## Two Operating Modes

**Pure mode** (default): verify, inspect, and decode receipts anywhere. No keys, no filesystem writes, no configuration needed. Safe for any environment.

```bash
npx -y @peac/mcp-server
```

**Issuer mode**: additionally issue receipts and create signed evidence bundles. Requires explicit operator opt-in via CLI flags. Privileged tools are only visible and callable when their prerequisites are configured:

- `--issuer-key` + `--issuer-id` enables `peac_issue`
- `--bundle-dir` additionally enables `peac_create_bundle`

```bash
npx -y @peac/mcp-server \
  --issuer-key env:PEAC_KEY \
  --issuer-id https://your-service.example.com \
  --bundle-dir ./bundles
```

Evidence bundles are self-contained directories with canonical manifests (sorted keys, SHA-256 receipt hashes, content-addressable `bundle_id`) and signed provenance (`manifest.jws`). The `bundle_id` is deterministic: same receipts and policy always produce the same ID regardless of when the bundle is created. Manifest content includes `created_at`, so the signature differs across runs. Bundles can be verified offline, diffed, cached, and used for audits, disputes, or SOC 2 evidence collection.

## CLI Options

```text
peac-mcp-server [options]

Options:
  --issuer-key <ref>   Issuer signing key (env:VAR or file:/path to Ed25519 JWK)
  --issuer-id <uri>    Issuer identifier URI (required with --issuer-key)
  --bundle-dir <path>  Directory for evidence bundle output
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
    "strip_payment": false,
    "inspect_full_claims": false
  },
  "tools": {
    "peac_verify": { "enabled": true },
    "peac_inspect": { "enabled": true },
    "peac_decode": { "enabled": true },
    "peac_issue": { "enabled": true },
    "peac_create_bundle": { "enabled": true }
  },
  "limits": {
    "max_jws_bytes": 16384,
    "max_response_bytes": 65536,
    "tool_timeout_ms": 30000,
    "max_concurrency": 10,
    "max_claims_bytes": 262144,
    "max_bundle_receipts": 256,
    "max_bundle_bytes": 16777216,
    "max_ttl_seconds": 86400
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
    version: '0.10.13',
    policyHash,
    protocolVersion: '2025-11-25',
  },
});

if (result.structured.ok) {
  // Signature valid, claims verified
}
```

## MCP SDK Compatibility

This package pins `@modelcontextprotocol/sdk` with a tilde range (patch-only updates). The SDK and workspace may use different Zod versions; schemas are structurally compatible at runtime. If upgrading the SDK, verify tool registration still works by running `pnpm --filter @peac/mcp-server test`. See `package.json` for actual pinned versions.

## Architecture

- **DD-51**: Pure handlers with no MCP SDK dependency
- **DD-52**: No ambient key discovery: explicit `--issuer-key` only
- **DD-53**: Static policy loaded once at startup with SHA-256 hash
- **DD-54**: Structured outputs (`structuredContent` + `text`) on every response
- **DD-55**: No URLs resolved from tool inputs (SSRF prevention)
- **DD-57**: Core modules (`handlers/`, `schemas/`, `infra/`) have zero MCP SDK imports
- **DD-58**: Line-buffered stdout fence validates JSON-RPC 2.0 output

## License

Apache-2.0
