# @peac/protocol

Receipt issuance and verification for the PEAC protocol.

## Installation

```bash
pnpm add @peac/protocol
```

## What It Does

`@peac/protocol` is Layer 3 of the PEAC protocol stack. It provides the high-level `issue()` and `verifyLocal()` APIs for creating and verifying signed interaction receipts in the Interaction Record format. It handles schema validation, kernel constraint enforcement, JOSE hardening, strictness profiles, policy binding, and structured error reporting.

## How Do I Use It?

### Issue a signed receipt

```typescript
import { issue, generateKeypair } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const result = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/commerce',
  privateKey,
  kid: 'key-1',
  pillars: ['commerce'],
  extensions: {
    'org.peacprotocol/commerce': {
      rail: 'stripe',
      amount_minor: '1000',
      currency: 'USD',
      event: 'authorization',
    },
  },
});

console.log(result.jws); // compact JWS string
```

### Verify a receipt locally

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://example.com',
  strictness: 'strict',
});

if (result.valid) {
  console.log(result.claims.type); // 'org.peacprotocol/commerce'
  console.log(result.claims.kind); // 'evidence'
  console.log(result.kid); // 'key-1'
  console.log(result.warnings); // VerificationWarning[]
  console.log(result.policy_binding); // 'unavailable' | 'verified'
} else {
  console.log(result.code); // e.g., 'E_INVALID_SIGNATURE'
  console.log(result.message);
}
```

### Verify with policy binding

```typescript
import { verifyLocal, computePolicyDigestJcs } from '@peac/protocol';

const policyDoc = { rules: [{ action: 'allow', resource: '/api/*' }] };
const digest = await computePolicyDigestJcs(policyDoc);

const result = await verifyLocal(jws, publicKey, {
  policyDigest: digest,
});

if (result.valid) {
  console.log(result.policy_binding); // 'verified' if receipt policy matches
}
```

### Verify with JWKS discovery

```typescript
import { verifyLocal } from '@peac/protocol';

// 1. Resolve issuer's /.well-known/peac-issuer.json -> jwks_uri -> public key
// 2. Pass the resolved key to verifyLocal()
const result = await verifyLocal(jws, resolvedPublicKey, {
  issuer: 'https://api.example.com',
});

if (result.valid) {
  console.log(result.claims.iss);
}
```

## Integrates With

- `@peac/kernel` (Layer 0): Constants, types, and error codes
- `@peac/schema` (Layer 1): Zod schemas and claim validation
- `@peac/crypto` (Layer 2): Ed25519 signing and JWS creation (re-exported for convenience)
- `@peac/mcp-server` (Layer 5): MCP tool server built on this package
- All `@peac/adapter-*` and `@peac/mappings-*` packages (Layer 4)

## For Agent Developers

If you are building an AI agent or MCP server that needs signed interaction receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `issue()` to create receipts and `verifyLocal()` to verify them when you have the public key
- Common crypto utilities (`generateKeypair`, `base64urlEncode`, `sha256Hex`, `verify`) are re-exported from `@peac/crypto` so a single import is sufficient for most workflows
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
