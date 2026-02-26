# PEAC Integrator Kit

One-page overview for potential integration partners. Use this when reaching out to A2A, x402, MCP ecosystem, or agent platform teams.

## What PEAC Does

PEAC Protocol is a portable, offline-verifiable evidence layer for AI agent interactions. It signs cryptographic receipts (Ed25519, JWS compact) that prove what terms applied and what happened, without requiring network calls to verify.

## 10-Second Demo

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

```
Receipt JWS: eyJ0eXAiOiJwZWFjLXJlY2VpcHQvMC4x...
Valid: true
Issuer: https://api.example.com
Amount: 100 USD
```

## 5-Line Integration

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { publicKey, privateKey } = await generateKeypair();
const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  amt: 100,
  cur: 'USD',
  rail: 'stripe',
  reference: 'tx_123',
  privateKey,
  kid: 'k1',
});
const result = await verifyLocal(jws, publicKey);
```

## What We Ship

| Package                          | What                          | npm                                                                                            |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `@peac/protocol`                 | Issue + verify receipts       | [@peac/protocol](https://www.npmjs.com/package/@peac/protocol)                                 |
| `@peac/mcp-server`               | MCP server (5 tools)          | [@peac/mcp-server](https://www.npmjs.com/package/@peac/mcp-server)                             |
| `@peac/mappings-a2a`             | A2A carrier adapter           | [@peac/mappings-a2a](https://www.npmjs.com/package/@peac/mappings-a2a)                         |
| `@peac/adapter-x402`             | x402 evidence adapter         | [@peac/adapter-x402](https://www.npmjs.com/package/@peac/adapter-x402)                         |
| `@peac/mappings-content-signals` | robots.txt/AIPREF/TDM parsing | [@peac/mappings-content-signals](https://www.npmjs.com/package/@peac/mappings-content-signals) |

28 packages total on npm. Full list: [GitHub](https://github.com/peacprotocol/peac).

## Transport Mappings

| Transport | Receipt Placement                    | Adapter                                    |
| --------- | ------------------------------------ | ------------------------------------------ |
| HTTP/REST | `PEAC-Receipt` response header       | Built-in                                   |
| MCP       | `_meta.org.peacprotocol/receipt_jws` | `@peac/mappings-mcp`                       |
| A2A       | `metadata[extensionURI].carriers[]`  | `@peac/mappings-a2a`                       |
| x402      | Settlement response evidence         | `@peac/adapter-x402`                       |
| ACP/UCP   | State transition metadata            | `@peac/mappings-acp`, `@peac/mappings-ucp` |

## What We Need From You (Micro-Asks)

Pick one that takes less than 10 minutes:

1. **"Does this carrier format work?"** Run our conformance harness against your test messages and tell us if the receipt placement feels right for your transport.

```bash
npx @peac/conformance-harness --transport mcp
```

2. **"Is this extension URI correct?"** Check that `org.peacprotocol/receipt_ref` and `org.peacprotocol/receipt_jws` are reasonable extension key names for your metadata format.

3. **"Would you link to us?"** Add PEAC to your integrations page or Agent Card extensions list. We provide the `server.json`, `smithery.yaml`, and README content.

## Links

- Protocol: [peacprotocol.org](https://www.peacprotocol.org)
- GitHub: [github.com/peacprotocol/peac](https://github.com/peacprotocol/peac)
- npm: [@peac/mcp-server](https://www.npmjs.com/package/@peac/mcp-server)
- MCP Registry: published
- llms.txt: [github.com/peacprotocol/peac/blob/main/llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt)
