# PEAC Integration Kit: Model Context Protocol (MCP)

Add receipt verification, inspection, and issuance to your MCP workflow. The `@peac/mcp-server` provides 5 tools that work with any MCP client (Claude, Cursor, Continue.dev, custom).

## Overview

PEAC integrates with MCP in two ways:

1. **As a standalone MCP server** (`@peac/mcp-server`): 5 tools for receipt operations
2. **As a metadata carrier** (`@peac/mappings-mcp`): attach receipts to tool responses via `_meta`

## Prerequisites

- Node.js >= 22.0.0

## Quick Start: stdio (default)

```bash
npx -y @peac/mcp-server
```

This starts the MCP server with 5 tools over stdio. Read-only tools (verify, inspect, decode) work immediately; issuance requires a key:

```bash
npx -y @peac/mcp-server --issuer-key env:PEAC_ISSUER_KEY --issuer-id https://api.example.com
```

## Quick Start: Streamable HTTP

Start the MCP server over HTTP with session isolation and RFC 9728 PRM:

```bash
npx -y @peac/mcp-server --transport http --port 3000
```

With issuance enabled:

```bash
npx -y @peac/mcp-server --transport http --port 3000 \
  --issuer-key env:PEAC_ISSUER_KEY --issuer-id https://api.example.com
```

The HTTP transport provides:

- Streamable HTTP per MCP specification
- Per-session isolation (CVE-2026-25536 defense)
- RFC 9728 Protected Resource Metadata (with `--public-url` and `--authorization-servers`)
- Rate limiting (100 req/min per session, configurable)
- CORS origin validation (deny-all by default)
- Binds to `127.0.0.1` by default (use `--host 0.0.0.0` only behind TLS)

See `examples/mcp-http-quickstart/` for a complete end-to-end demo.

## Tools

| Tool                 | Description                                                                           | Requires Key |
| -------------------- | ------------------------------------------------------------------------------------- | ------------ |
| `peac_verify`        | Verify a receipt: check Ed25519 signature, validate claims, return structured results | No           |
| `peac_inspect`       | Inspect a receipt without signature check: decoded header, payload, timestamps        | No           |
| `peac_decode`        | Raw-decode a JWS into header and payload objects                                      | No           |
| `peac_issue`         | Sign and return a new receipt JWS                                                     | Yes          |
| `peac_create_bundle` | Create a signed evidence bundle from one or more receipts                             | Yes          |

## Use Case 1: Verify a Receipt from Claude or Cursor

Configure the MCP server in your client:

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

Then ask your AI assistant: "Verify this receipt: eyJhbGciOi..."

The `peac_verify` tool checks the Ed25519 signature, validates claims, and returns a structured verification report.

## Use Case 2: Attach Receipts to Your Own MCP Tool Responses

If you build a paid or metered MCP tool, attach receipts to responses:

```typescript
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';

const { publicKey, privateKey } = await generateKeypair();

// In your tool handler:
const { jws } = await issue({
  iss: 'https://mcp-provider.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'stripe',
      amount_minor: '500',
      currency: 'USD',
    },
  },
  privateKey,
  kid: 'tool-key',
});

const ref = await computeReceiptRef(jws);

// Return in MCP _meta:
const response = {
  content: [{ type: 'text', text: 'Search results...' }],
  _meta: {
    'org.peacprotocol/receipt_ref': ref,
    'org.peacprotocol/receipt_jws': jws,
  },
};
```

## Use Case 3: Extract Receipts from Tool Responses

```typescript
import { extractReceipt, hasReceipt } from '@peac/mappings-mcp';
import { verifyLocal } from '@peac/protocol';

const toolResponse = /* MCP tool result */;
if (hasReceipt(toolResponse)) {
  const carrier = extractReceipt(toolResponse);
  if (carrier?.receipt_jws) {
    const result = await verifyLocal(carrier.receipt_jws, issuerPublicKey);
    console.log('Valid:', result.valid);
  }
}
```

## Configuration

| Option         | Type     | Default | Description                                           |
| -------------- | -------- | ------- | ----------------------------------------------------- |
| `--issuer-key` | `string` | none    | Ed25519 JWK for issuance (`env:VAR` or `file:/path`)  |
| `--issuer-id`  | `string` | none    | Issuer URI (e.g., `https://your-service.example.com`) |
| `--bundle-dir` | `string` | none    | Directory for evidence bundle output                  |
| `--jwks-file`  | `string` | none    | JWKS file for verifier key resolution                 |
| `--transport`  | `string` | `stdio` | Transport: `stdio` or `http`                          |

## Troubleshooting

**"peac_issue requires an issuer key":**
Start the server with `--issuer-key`. Read-only tools (verify, inspect, decode) work without it.

**Receipt verification fails:**
Ensure you have the correct public key for the issuer. Keys are published at `/.well-known/peac-issuer.json` -> `jwks_uri`.

**MCP client does not show PEAC tools:**
Verify the server starts with `npx -y @peac/mcp-server --help`. Check your client's MCP server configuration path.

## Next Steps

- [MCP Tool Call Example](../../examples/mcp-tool-call/) for a full paid-tool demo
- [Pay-per-Inference Example](../../examples/pay-per-inference/) for 402 payment flow
- [Evidence Carrier Contract](../../docs/specs/EVIDENCE-CARRIER-CONTRACT.md) for MCP `_meta` key conventions
- [MCP Specification](https://modelcontextprotocol.io) for the upstream protocol

## Related documents

- [Hosted Verify contract](../../docs/HOSTED_VERIFY_CONTRACT.md)
- [Trust artifacts](../../docs/TRUST-ARTIFACTS.md)
- [Stability contract](../../docs/STABILITY-CONTRACT.md)
- [Threat model](../../docs/THREAT_MODEL.md)
- [Compliance mappings](../../docs/compliance/README.md)
