# @peac/adapter-eat

EAT (Entity Attestation Token, RFC 9711) passport decoder and PEAC claim mapper with privacy-first defaults.

## Installation

```bash
pnpm add @peac/adapter-eat
```

## What It Does

`@peac/adapter-eat` is a Layer 4 adapter that decodes COSE_Sign1 structures (RFC 9052) containing Entity Attestation Token payloads and maps them into Interaction Record format claims. It verifies Ed25519 signatures, enforces a 64 KB size limit before CBOR decode to prevent denial-of-service, and hashes all claim values with SHA-256 by default so that no raw attestation data leaks into PEAC receipts.

## How Do I Use It?

### Decode and verify an EAT passport

```typescript
import { decodeEatPassport } from '@peac/adapter-eat';

const result = await decodeEatPassport(coseBytes, publicKey);

if (result.verified) {
  console.log('Claims:', result.claims);
  console.log('Algorithm:', result.headers.alg); // -8 (EdDSA)
}
```

### Map EAT claims to PEAC receipt claims

```typescript
import { decodeEatPassport, mapEatClaims } from '@peac/adapter-eat';

const result = await decodeEatPassport(coseBytes, publicKey);
if (result.verified) {
  // Privacy-first: all values are SHA-256 hashed by default
  const mapped = await mapEatClaims(result.claims);
  console.log('Type:', mapped.type); // 'org.peacprotocol/attestation'
  console.log('Pillars:', mapped.pillars); // ['identity']
  console.log('Values:', mapped.values); // Map<number, string> with hashed values

  // Opt in to raw values when needed
  const raw = await mapEatClaims(result.claims, { includeRawClaims: true });
}
```

## Integrates With

- `@peac/kernel` (Layer 0): Wire constants and types
- `@peac/schema` (Layer 1): Interaction Record format claim schemas
- `@peac/crypto` (Layer 2): Ed25519 signature verification and SHA-256 hashing
- `@peac/protocol` (Layer 3): Receipt issuance with mapped EAT claims

## For Agent Developers

If you are building an agent that needs to verify device or entity attestations:

- Use `decodeEatPassport()` to decode and verify COSE_Sign1 tokens from hardware or software attestation sources
- Use `mapEatClaims()` to convert verified attestations into PEAC receipt claims with privacy-safe defaults
- Only Ed25519 (COSE algorithm -8) is supported; all other algorithms are rejected
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
