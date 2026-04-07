# Quickstart: Agent Operator (Verify Receipts)

Verify a signed receipt in under 5 minutes. No server needed; verification is offline.

## Prerequisites

- Node.js >= 22.0.0

## 1. Install

```bash
pnpm add @peac/protocol @peac/crypto
```

## 2. Verify a receipt

```typescript
import { verifyLocal } from '@peac/protocol';
import { importPublicKey } from '@peac/crypto';

// The receipt JWS (from a PEAC-Receipt header, MCP tool response, or A2A metadata)
const receiptJws = '<compact JWS string>';

// The issuer's public key (from their /.well-known/peac-issuer.json -> jwks_uri)
const publicKey = await importPublicKey({
  kty: 'OKP',
  crv: 'Ed25519',
  x: '<base64url public key>',
});

const result = await verifyLocal(receiptJws, publicKey);

if (result.valid) {
  console.log('Issuer:', result.claims.iss);
  console.log('Kind:', result.claims.kind);
  console.log('Type:', result.claims.type);

  // Access typed extensions
  if (result.variant === 'wire-02') {
    console.log('Pillars:', result.claims.pillars);
  }
} else {
  console.log('Verification failed:', result.code, result.message);
}
```

## 3. Try it end-to-end

Generate a receipt and verify it in one script:

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { publicKey, privateKey } = await generateKeypair();

// Issue
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

// Verify
const result = await verifyLocal(jws, publicKey);
console.log('Valid:', result.valid);
```

## What verification checks

- Ed25519 signature validity
- JWS structure and JOSE header compliance
- Issuer format (`https://` or `did:` only)
- Timestamp bounds (issued-at, expiration)
- Kernel constraints (fail-closed)
- Type-to-extension enforcement (strict mode)
- Policy binding (if policy digest is present)

## Where receipts come from

| Source          | Location                             | Extract with         |
| --------------- | ------------------------------------ | -------------------- |
| HTTP API        | `PEAC-Receipt` response header       | Read header value    |
| MCP tool        | `_meta.org.peacprotocol/receipt_jws` | `@peac/mappings-mcp` |
| A2A task        | `metadata[extensionURI].carriers[]`  | `@peac/mappings-a2a` |
| x402 payment    | Settlement response                  | `@peac/adapter-x402` |
| Evidence bundle | Directory of receipts                | `@peac/audit`        |

## Next steps

- See [examples/minimal](../../examples/minimal/) for typed accessor helpers
- See [examples/workflow-correlation](../../examples/workflow-correlation/) for multi-step verification
- Read [PROTOCOL-BEHAVIOR](../specs/PROTOCOL-BEHAVIOR.md) for normative verification rules
- Read [Architecture](../ARCHITECTURE.md) for package layering
