# MCP Directory Submissions

Copy-paste fields for submitting `@peac/mcp-server` to MCP directories.

## Common Fields

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| **Name**      | PEAC Protocol                                    |
| **Package**   | `@peac/mcp-server`                               |
| **npm**       | <https://www.npmjs.com/package/@peac/mcp-server> |
| **GitHub**    | <https://github.com/peacprotocol/peac>           |
| **Homepage**  | <https://www.peacprotocol.org>                   |
| **License**   | Apache-2.0                                       |
| **Install**   | `npx -y @peac/mcp-server`                        |
| **Transport** | stdio (default), Streamable HTTP                 |
| **Node.js**   | >= 22.0.0                                        |

## Title (for registry listings)

PEAC Protocol: Signed interaction receipts

## Short Description (1 line)

Verify, inspect, decode, issue, and bundle signed receipts for agent, API, and MCP interactions. Portable and offline-verifiable.

## Medium Description (2-3 sentences)

PEAC Protocol MCP server provides 5 tools for signed interaction receipts: verify Ed25519 signatures, inspect metadata, decode payloads, issue signed receipts, and create evidence bundles. Read-only operations (verify, inspect, decode) require no configuration. Issuance requires an Ed25519 key via `--issuer-key`.

## Tools

| Tool                 | Description                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `peac_verify`        | Verify a PEAC receipt: check Ed25519 signature, validate claims, and return structured check results. Read-only, no side effects. |
| `peac_inspect`       | Inspect a PEAC receipt without verifying the signature. Returns decoded header, payload metadata, and timestamps. Read-only.      |
| `peac_decode`        | Raw-decode a PEAC receipt JWS into header and payload objects. No signature check.                                                |
| `peac_issue`         | Sign and return a new PEAC receipt JWS. Requires server configured with an Ed25519 issuer key.                                    |
| `peac_create_bundle` | Create a signed evidence bundle directory from one or more receipt JWS strings.                                                   |

## Category / Tags

Evidence, Verification, Security, Cryptography, Audit, Compliance, Receipts

## Submission URLs

| Directory               | URL                                                     | Status              |
| ----------------------- | ------------------------------------------------------- | ------------------- |
| MCP Registry (Official) | Published via `mcp-publisher` CLI                       | Published (v0.12.2) |
| PulseMCP                | Auto-ingested from MCP Registry                         | Verify listing      |
| Smithery                | <https://smithery.ai/new>                               | Not submitted       |
| mcpservers.org          | <https://mcpservers.org/submit>                         | Not submitted       |
| mcp.so                  | <https://mcp.so/submit>                                 | Not submitted       |
| awesome-mcp-servers     | PR to <https://github.com/punkpeye/awesome-mcp-servers> | Not submitted       |
| Glama                   | Auto-indexed from GitHub                                | Verify listing      |

## awesome-mcp-servers PR Entry

For the PR to `punkpeye/awesome-mcp-servers`, add under the appropriate category:

```markdown
- [PEAC Protocol](https://github.com/peacprotocol/peac) - Verify, inspect, issue, and bundle cryptographic evidence receipts for AI agent and API interactions. Portable, offline-verifiable JWS records with Ed25519 signatures.
```

## Smithery Notes

- `smithery.yaml` is included in the `@peac/mcp-server` npm package
- Transport: stdio (gateway HTTP available via `--transport http`)
- Config schema includes optional `issuerKey`, `issuerId`, `bundleDir`, `jwksFile`
