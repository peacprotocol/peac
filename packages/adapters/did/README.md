# @peac/adapter-did

DID document resolution for PEAC receipt verification. Supports did:key with zero network I/O.

## Installation

```bash
pnpm add @peac/adapter-did
```

## What It Does

`@peac/adapter-did` is a Layer 4 adapter that resolves W3C Decentralized Identifiers (DIDs) to Ed25519 public keys for use with `verifyLocal()`. It implements the DID Verification Method Selection Policy (DD-202) for deterministic key extraction.

Currently supports `did:key` (Ed25519, zero network I/O). `did:web` (SSRF-hardened HTTPS) and caching are follow-up work.

## How Do I Use It?

### Resolve a did:key and extract the public key

```typescript
import { DidKeyResolver, extractVerificationKey } from '@peac/adapter-did';
import { verifyLocal } from '@peac/protocol';

const resolver = new DidKeyResolver();
const result = await resolver.resolve('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
const publicKey = extractVerificationKey(result.didDocument!);

const verification = await verifyLocal(receiptJws, publicKey!, {
  strictness: 'strict',
});
```

### Use a composite resolver for multiple DID methods

```typescript
import { createCompositeResolver, DidKeyResolver } from '@peac/adapter-did';

const resolver = createCompositeResolver([
  new DidKeyResolver(),
  // add DidWebResolver here when available
]);

const result = await resolver.resolve('did:key:z6Mk...');
```

## Integrates With

- `@peac/kernel` (Layer 0): Error codes (E*DID*\*) and types
- `@peac/schema` (Layer 1): Schema validation
- `@peac/protocol` (Layer 3): `verifyLocal()` accepts the extracted public key directly

## Supported Key Types

Only Ed25519 keys are extracted. Other key types are silently skipped to prevent key-type oracle attacks. Both multibase encodings from the did:key spec are supported: `z` (base58btc) and `u` (base64url).

## Standards

- W3C DID Core v1.0 (Recommendation 2022): baseline type model
- did:key (W3C CCG v0.9): method-specific resolution as interoperability adapter
- did:web (W3C CCG draft): planned in follow-up, not a normative dependency

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
