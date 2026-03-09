# PEAC Integration Checklist

One-page technical overview for evaluating PEAC Protocol integration with agent transports and platforms.

## What PEAC Does

PEAC Protocol is a portable, offline-verifiable evidence layer for AI agent interactions. It signs cryptographic receipts (Ed25519, JWS compact) that prove what terms applied and what happened, without requiring network calls to verify.

## Quick Start

```bash
npx -y @peac/mcp-server --help
```

Or run the hello-world example:

```bash
git clone https://github.com/peacprotocol/peac.git
cd peac/examples/hello-world
npm install @peac/crypto @peac/protocol tsx typescript
npx tsx demo.ts
```

Expected output:

```text
Receipt JWS: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJl...
Valid: true
Issuer: https://api.example.com
Kind: evidence
```

## 5-Line Integration

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { publicKey, privateKey } = await generateKeypair();
const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  pillars: ['commerce'],
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'stripe',
      amount_minor: '10000',
      currency: 'USD',
    },
  },
  privateKey,
  kid: 'k1',
});
const result = await verifyLocal(jws, publicKey);
```

## Packages

| Package                          | Description                   | npm                                                                                            |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `@peac/protocol`                 | Issue + verify receipts       | [@peac/protocol](https://www.npmjs.com/package/@peac/protocol)                                 |
| `@peac/mcp-server`               | MCP server (5 tools)          | [@peac/mcp-server](https://www.npmjs.com/package/@peac/mcp-server)                             |
| `@peac/mappings-a2a`             | A2A carrier adapter           | [@peac/mappings-a2a](https://www.npmjs.com/package/@peac/mappings-a2a)                         |
| `@peac/adapter-x402`             | x402 evidence adapter         | [@peac/adapter-x402](https://www.npmjs.com/package/@peac/adapter-x402)                         |
| `@peac/mappings-content-signals` | robots.txt/AIPREF/TDM parsing | [@peac/mappings-content-signals](https://www.npmjs.com/package/@peac/mappings-content-signals) |

Full package list: see `scripts/publish-manifest.json` or [GitHub](https://github.com/peacprotocol/peac).

## Transport Mappings

| Transport | Receipt Placement                    | Adapter                                    |
| --------- | ------------------------------------ | ------------------------------------------ |
| HTTP/REST | `PEAC-Receipt` response header       | Built-in                                   |
| MCP       | `_meta.org.peacprotocol/receipt_jws` | `@peac/mappings-mcp`                       |
| A2A       | `metadata[extensionURI].carriers[]`  | `@peac/mappings-a2a`                       |
| x402      | Settlement response evidence         | `@peac/adapter-x402`                       |
| ACP/UCP   | State transition metadata            | `@peac/mappings-acp`, `@peac/mappings-ucp` |

## Compatibility Checks

1. **Carrier format verification:** Clone the repo and run the MCP server smoke test to confirm receipt placement works for your transport.

```bash
git clone https://github.com/peacprotocol/peac.git
cd peac && pnpm install && pnpm build
pnpm test --filter @peac/mappings-mcp
```

1. **Extension URI review:** Verify that `org.peacprotocol/receipt_ref` and `org.peacprotocol/receipt_jws` are compatible extension key names for your metadata format.

## Links

- Protocol: [peacprotocol.org](https://www.peacprotocol.org)
- GitHub: [github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- npm: [@peac/mcp-server](https://www.npmjs.com/package/@peac/mcp-server)
- MCP Registry: published
- llms.txt: [github.com/peacprotocol/peac/blob/main/llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt)
