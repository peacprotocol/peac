# @peac/adapter-eat

EAT (Entity Attestation Token, RFC 9711) passport decoder and PEAC claim mapper.

## Features

- Decodes COSE_Sign1 tokens (RFC 9052) with Ed25519 signature verification
- Privacy-first claim mapping: SHA-256 hashes all values by default
- 64 KB size limit enforced before CBOR decode
- Only EdDSA (alg: -8) is supported

## Usage

```typescript
import { decodeEatPassport, mapEatClaims } from '@peac/adapter-eat';

const result = await decodeEatPassport(coseBytes, publicKey);
if (result.verified) {
  const mapped = await mapEatClaims(result.claims);
  // mapped.values: Map<number, string> with sha256:hex hashed values
}
```

## Layer

Layer 4 adapter. Depends on `@peac/kernel`, `@peac/schema`, `@peac/crypto`.

## License

Apache-2.0
