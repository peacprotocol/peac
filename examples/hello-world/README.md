# PEAC Hello World

Generate a keypair, sign a receipt, verify it offline. Under 10 lines of logic.

## Run (in monorepo)

```bash
cd examples/hello-world
pnpm demo
```

## Run standalone (outside monorepo)

```bash
mkdir peac-hello && cd peac-hello
npm init -y
npm install @peac/crypto @peac/protocol tsx typescript
```

Create `demo.ts`:

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
  kid: 'demo-key',
});

const result = await verifyLocal(jws, publicKey);
console.log('Valid:', result.valid);
```

Run:

```bash
npx tsx demo.ts
```

Expected output:

```text
Receipt JWS: eyJhbGciOiJFZERTQSIsInR5cCI6ImludGVyYWN0aW9uLXJl...
Valid: true
Issuer: https://api.example.com
Kind: evidence
```

## With MCP Server

Add the MCP server to Claude Desktop or Cursor, then ask your agent:

> "Verify this PEAC receipt: eyJhbGci..."

See the [MCP server README](../../packages/mcp-server/README.md) for setup instructions.

## Links

- [PEAC Protocol](https://www.peacprotocol.org)
- [GitHub](https://github.com/peacprotocol/peac)
- [@peac/mcp-server on npm](https://www.npmjs.com/package/@peac/mcp-server)
- Built by [Originary](https://www.originary.xyz)
