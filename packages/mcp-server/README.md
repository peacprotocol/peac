# @peac/mcp-server

Local MCP server for PEAC signed interaction records. It exposes tools to verify, inspect, decode, issue, and bundle PEAC records through stdio or the local Streamable HTTP transport.

## Installation

```bash
pnpm add @peac/mcp-server
```

Or run directly:

```bash
npx @peac/mcp-server
```

## What It Does

`@peac/mcp-server` exposes PEAC signed interaction record operations as Model Context Protocol (MCP) tools that AI agents and LLM-based applications can call. It supports both stdio and Streamable HTTP transports, with static policy checks, concurrency limits, input size guards, and structured error responses with recovery hints.

## How Do I Use It?

### Add to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Add to Cursor or Windsurf

Add to `.mcp.json` at your project root:

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

### Streamable HTTP transport

```bash
npx @peac/mcp-server --transport http --port 3000
```

HTTP transport provides per-session isolation, rate limiting, and RFC 9728 PRM discovery. Binds to `127.0.0.1` by default. See `examples/mcp-http-quickstart/` for an end-to-end demo.

### Enable receipt issuance

```bash
npx @peac/mcp-server \
  --issuer-key env:PEAC_ISSUER_KEY \
  --issuer-id https://example.com
```

### Start with HTTP transport

```bash
npx @peac/mcp-server --transport http --port 3000
```

### CLI options

| Flag                    | Description                                            | Default          |
| ----------------------- | ------------------------------------------------------ | ---------------- |
| `--transport <type>`    | Transport: `stdio` or `http`                           | `stdio`          |
| `--port <number>`       | HTTP port                                              | `3000`           |
| `--host <address>`      | HTTP bind address                                      | `127.0.0.1`      |
| `--issuer-key <ref>`    | Issuer key reference (`env:VAR` or `file:/path`)       | None             |
| `--issuer-id <uri>`     | Issuer identifier URI                                  | None             |
| `--policy <path>`       | Policy configuration file path                         | Built-in default |
| `--jwks-file <path>`    | JWKS file for verifier key resolution                  | None             |
| `--bundle-dir <path>`   | Directory for evidence bundle output                   | None             |
| `--cors-origins <list>` | Allowed CORS origins (comma-separated, HTTP only)      | None             |
| `--trust-proxy <value>` | Trust `X-Forwarded-For` (`off`, `loopback`, `private`) | `off`            |

### Programmatic usage

Handlers can be used directly without the MCP server binding:

```typescript
import { createPeacMcpServer, handleVerify } from '@peac/mcp-server';
import { getDefaultPolicy, computePolicyHash } from '@peac/mcp-server';

const policy = getDefaultPolicy();
const policyHash = await computePolicyHash(JSON.stringify(policy));

const result = await handleVerify({
  input: { jws: 'eyJ...', public_key_base64url: '...' },
  policy,
  context: {
    version: '0.12.4',
    policyHash,
    protocolVersion: '0.2',
  },
});
```

## Available tools

| Tool                 | Description                                                     | Availability                                               |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `peac_verify`        | Verify a PEAC signed interaction record.                        | Always                                                     |
| `peac_inspect`       | Inspect a PEAC signed interaction record without verification.  | Always                                                     |
| `peac_decode`        | Decode a PEAC receipt JWS header and payload for diagnostics.   | Always                                                     |
| `peac_issue`         | Issue a PEAC signed interaction record from provided claims.    | Requires `--issuer-key` and `--issuer-id`                  |
| `peac_create_bundle` | Create a PEAC bundle from signed records and related artifacts. | Requires `--issuer-key`, `--issuer-id`, and `--bundle-dir` |

All tool responses include `_meta` with `serverVersion`, `policyHash`, `protocolVersion`, and `registeredTools`.

## Integrates With

- `@peac/protocol` (Layer 3): signed-record issuance and verification
- `@peac/crypto` (Layer 2): JWS signing and decoding
- `@peac/schema` (Layer 1): Receipt schema validation
- `@peac/kernel` (Layer 0): Error codes and constants
- `@modelcontextprotocol/sdk`: MCP server and transport bindings

## For Agent Developers

Connect your agent to this server over stdio or HTTP to gain signed-record verification, receipt decoding, and issuance capabilities. The tools use structured outputs with error codes and `next_action` recovery hints so your agent can handle failures programmatically. Every response includes `_meta` for audit and traceability.

Read-only tools (`peac_verify`, `peac_inspect`, `peac_decode`) are available with no configuration. To enable issuance, provide an Ed25519 signing key via `--issuer-key` and `--issuer-id`.

## For Operators

The server applies static policy checks with configurable concurrency limits, input size bounds, JWS size caps, and tool timeouts. HTTP transport binds to localhost by default with CORS deny-all. The stdout fence prevents non-JSON-RPC output from corrupting the stdio transport.

Security properties: no ambient key discovery (keys must be explicitly provided), no implicit network fetches from tool handlers, path traversal prevention on bundle output, and session isolation on HTTP transport.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
