# @peac/protocol

PEAC protocol implementation: receipt issuance, offline verification, and JWKS resolution.

## Installation

```bash
pnpm add @peac/protocol @peac/crypto
```

## What It Does

`@peac/protocol` is Layer 3 of the PEAC stack. It provides `issue()` for signing receipts and `verifyLocal()` for offline verification with Ed25519 public keys. No network calls needed for verification.

## How Do I Issue a Receipt?

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue } from '@peac/protocol';

const { publicKey, privateKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://api.example.com',
  aud: 'https://client.example.com',
  amt: 100,
  cur: 'USD',
  rail: 'stripe',
  reference: 'pi_abc123',
  privateKey,
  kid: 'key-2026-02',
});
```

## How Do I Verify a Receipt?

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(jws, publicKey);

if (result.valid && result.variant === 'commerce') {
  console.log(result.claims.iss); // issuer
  console.log(result.claims.amt); // amount
  console.log(result.claims.cur); // currency
} else if (!result.valid) {
  console.log(result.code, result.message);
}
```

## How Do I Verify with JWKS Discovery?

```typescript
import { verifyReceipt } from '@peac/protocol';

// Resolves issuer's /.well-known/peac-issuer.json -> jwks_uri -> public key
const result = await verifyReceipt(jws);

if (result.valid) {
  console.log('Verified against issuer JWKS');
}
```

## Integrates With

- `@peac/crypto` (Layer 2): Ed25519 key generation and JWS encoding
- `@peac/kernel` (Layer 0): Error codes and wire format constants
- `@peac/schema` (Layer 1): Receipt claim validation
- `@peac/mcp-server` (Layer 5): MCP tool server using protocol functions
- `@peac/middleware-express` (Layer 3.5): Express middleware for automatic receipt issuance

## Security

- Verification is offline and deterministic: no network calls for `verifyLocal()`
- Fail-closed: invalid or missing evidence always produces a verification failure
- JWKS resolution (when used) is SSRF-hardened with HTTPS-only, private IP denial

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
