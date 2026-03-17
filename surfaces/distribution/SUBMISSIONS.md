# MCP Directory Submissions

Copy-paste fields for submitting `@peac/mcp-server` to MCP directories.

## Canonical Listing Packet

| Field         | Value                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| **Title**     | PEAC Protocol: Signed interaction receipts                                           |
| **Package**   | `@peac/mcp-server`                                                                   |
| **npm**       | <https://www.npmjs.com/package/@peac/mcp-server>                                     |
| **GitHub**    | <https://github.com/peacprotocol/peac>                                               |
| **Website**   | <https://www.peacprotocol.org>                                                       |
| **License**   | Apache-2.0                                                                           |
| **Install**   | `npx -y @peac/mcp-server`                                                            |
| **Transport** | stdio (default), Streamable HTTP                                                     |
| **Node.js**   | >= 22.0.0                                                                            |
| **Steward**   | PEAC Protocol is open source and community-developed, with stewardship by Originary. |

## Short Description (under 100 chars)

Signed receipts for agent, API, and MCP interactions. Portable and offline-verifiable.

## Long Description

Verify, inspect, decode, issue, and bundle signed receipts for agent, API, and MCP interactions. Portable and offline-verifiable.

## Medium Description (2-3 sentences)

PEAC Protocol MCP server provides 5 tools for signed interaction receipts: verify Ed25519 signatures, inspect metadata, decode payloads, issue signed receipts, and create evidence bundles. Read-only operations (verify, inspect, decode) require no configuration. Issuance requires an Ed25519 key via `--issuer-key`.

## Tools

| Tool                 | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| `peac_verify`        | Verify a receipt: check Ed25519 signature, validate claims, return results |
| `peac_inspect`       | Inspect a receipt without signature check: header, payload, timestamps     |
| `peac_decode`        | Raw-decode a JWS into header and payload objects                           |
| `peac_issue`         | Sign and return a new receipt JWS (requires issuer key)                    |
| `peac_create_bundle` | Create a signed evidence bundle from one or more receipts                  |

## Categories / Tags

Security, Verification, Audit, Compliance, Cryptography, MCP

## Submission Status

| Directory               | URL                                                     | Status              |
| ----------------------- | ------------------------------------------------------- | ------------------- |
| MCP Registry (Official) | Published via `mcp-publisher` CLI                       | Published (v0.12.2) |
| PulseMCP                | Auto-ingested from MCP Registry                         | Verify listing      |
| Smithery                | <https://smithery.ai/new>                               | Not submitted       |
| mcpservers.org          | <https://mcpservers.org/submit>                         | Not submitted       |
| mcp.so                  | <https://mcp.so/submit>                                 | Not submitted       |
| awesome-mcp-servers     | PR to <https://github.com/punkpeye/awesome-mcp-servers> | Not submitted       |
| Glama                   | Auto-indexed from GitHub                                | Verify listing      |

## awesome-mcp-servers PR

Entry:

```markdown
- [PEAC Protocol](https://github.com/peacprotocol/peac) - Verify, inspect, issue, and bundle signed interaction receipts for agent, API, and MCP interactions. Portable, offline-verifiable JWS records with Ed25519 signatures.
```

PR title: `Add PEAC Protocol MCP server`

PR body:

```markdown
Adds PEAC Protocol to the list.

- Package: `@peac/mcp-server`
- Install: `npx -y @peac/mcp-server`
- Tools: verify, inspect, decode, issue, bundle
- Transport: stdio (default), Streamable HTTP
- License: Apache-2.0
- Registry: published on the official MCP Registry as `io.github.peacprotocol/peac`
```

## Smithery Notes

- `smithery.yaml` is included in the `@peac/mcp-server` npm package
- Transport: stdio (gateway HTTP available via `--transport http`)
- Config schema includes optional `issuerKey`, `issuerId`, `bundleDir`, `jwksFile`
