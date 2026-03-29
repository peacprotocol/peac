# @peac/crypto

Ed25519 JWS signing and verification for PEAC protocol receipts.

## Installation

```bash
pnpm add @peac/crypto
```

## What It Does

`@peac/crypto` is Layer 2 of the PEAC protocol stack. It provides Ed25519 key generation, JWS compact serialization (signing and verification), SHA-256 hashing, base64url encoding, JWK thumbprint computation, and JSON Canonicalization (RFC 8785). All primitives are runtime-agnostic and work in Node.js, browsers, and edge workers.

## How Do I Use It?

### Generate a keypair and sign a receipt

```typescript
import { generateKeypair, sign } from '@peac/crypto';

const { privateKey, publicKey } = await generateKeypair();

const payload = { iss: 'https://example.com', kind: 'evidence', type: 'org.example/flow' };
const jws = await sign(payload, privateKey, 'key-1');

console.log(jws); // compact JWS string
```

### Verify a JWS and inspect the result

```typescript
import { verify, decode } from '@peac/crypto';

// Cryptographic verification (requires public key)
const result = await verify(jws, publicKey);
console.log(result.header.kid); // 'key-1'
console.log(result.payload); // { iss: 'https://example.com', ... }

// Decode without verification (for inspection only)
const { header, payload } = decode(jws);
```

### Compute a SHA-256 hash

```typescript
import { sha256Hex, sha256Bytes, sha256Base64url } from '@peac/crypto';

const hex = await sha256Hex('hello'); // 64-char lowercase hex
const bytes = await sha256Bytes('hello'); // 32-byte Uint8Array
const b64u = await sha256Base64url('hello'); // 43-char base64url
```

### Compute an RFC 7638 JWK thumbprint

```typescript
import { computeJwkThumbprint, jwkToPublicKeyBytes } from '@peac/crypto';

const jwk = { kty: 'OKP', crv: 'Ed25519', x: '<base64url-public-key>' };

const thumbprint = await computeJwkThumbprint(jwk); // base64url SHA-256
const keyBytes = jwkToPublicKeyBytes(jwk); // 32-byte Uint8Array
```

### Use raw Ed25519 primitives

```typescript
import {
  ed25519RandomSecretKey,
  ed25519GetPublicKey,
  ed25519Sign,
  ed25519Verify,
} from '@peac/crypto';

const secretKey = ed25519RandomSecretKey();
const publicKey = await ed25519GetPublicKey(secretKey);
const signature = await ed25519Sign(new TextEncoder().encode('data'), secretKey);
const valid = await ed25519Verify(signature, new TextEncoder().encode('data'), publicKey);
```

## Integrates With

- `@peac/kernel` (Layer 0): Wire format constants and error codes
- `@peac/schema` (Layer 1): Zod validators for receipt claims
- `@peac/protocol` (Layer 3): High-level issuance and verification built on this package

## For Agent Developers

If you are building an AI agent or MCP server that needs signed interaction receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification; it re-exports the most common crypto utilities so you rarely need to import `@peac/crypto` directly
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
