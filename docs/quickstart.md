# PEAC Protocol Quickstart

## Issue and Verify a Receipt

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

// 1. Generate Ed25519 keypair
const { publicKey, privateKey } = await generateKeypair();

// 2. Issue a signed receipt (Interaction Record format)
const { jws } = await issue({
  iss: 'https://api.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/payment',
  extensions: {
    'org.peacprotocol/commerce': {
      payment_rail: 'stripe',
      amount_minor: '1000',
      currency: 'USD',
    },
  },
  privateKey,
  kid: 'demo-key',
});

// 3. Verify the receipt offline (no network calls)
const result = await verifyLocal(jws, publicKey);
console.log('Valid:', result.valid);
```

## Run the Hello-World Example

```bash
git clone https://github.com/peacprotocol/peac.git
cd peac && pnpm install && pnpm build
cd examples/hello-world
pnpm exec tsx demo.ts
```

Expected output:

```text
Receipt JWS: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJl...
Valid: true
Issuer: https://api.example.com
Kind: evidence
Type: org.peacprotocol/payment
```

## MCP Server

Run the MCP server to verify, inspect, decode, issue, and bundle receipts:

```bash
npx -y @peac/mcp-server --help
```

Read-only operations (verify, inspect, decode) require no configuration. Issuance requires an Ed25519 key via `--issuer-key`.

## Installation

```bash
# Install core packages
pnpm add @peac/crypto @peac/protocol

# Or clone the monorepo for all examples
git clone https://github.com/peacprotocol/peac.git
cd peac
pnpm install && pnpm build
```

## Key Concepts

- **Receipt:** A signed JWS (`interaction-record+jwt`) proving what terms applied and what happened
- **Kind:** `evidence` (records what happened) or `challenge` (requests proof from a peer)
- **Type:** Reverse-DNS identifier for what the receipt represents (e.g., `org.peacprotocol/payment`)
- **Extensions:** Typed data groups (commerce, access, identity, etc.) carrying domain-specific evidence
- **Offline verification:** Receipts verify with just the public key; no network calls required

## SSRF Protection

The verifier and networking layer include SSRF protection by default:

- **HTTPS only** (http allowed only for localhost/127.0.0.1)
- **Private IP blocking** (unless `PEAC_ALLOW_PRIVATE_NET=true`)
- **Size limits** (max 256 KiB per source)
- **Timeout limits** (max 150ms per fetch, 250ms total)
- **Redirect limits** (max 3 same-scheme redirects)

## Next Steps

- See [examples/](https://github.com/peacprotocol/peac/tree/main/examples) for 30 runnable examples
- Read [PROTOCOL-BEHAVIOR.md](specs/PROTOCOL-BEHAVIOR.md) for normative protocol specification
- Read [WIRE-0.2.md](specs/WIRE-0.2.md) for the current Interaction Record format specification
- See [Error Handling](errors.md) for RFC 9457 Problem Details
- Review [Architecture](ARCHITECTURE.md) for package layering
