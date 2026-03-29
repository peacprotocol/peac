# @peac/mappings-tap

Visa Trusted Agent Protocol (TAP) mapping to PEAC control evidence: verifies TAP HTTP signatures and maps results to control chain entries.

## Installation

```bash
pnpm add @peac/mappings-tap
```

## What It Does

`@peac/mappings-tap` verifies Visa Trusted Agent Protocol (TAP) HTTP message signatures (RFC 9421) and maps the verification result into PEAC control evidence entries. It enforces TAP-specific constraints including the 8-minute signature window, Ed25519 algorithm requirement, and tag allowlist. Verified proofs produce `TapControlEntry` objects suitable for inclusion in a receipt's control chain.

## How Do I Use It?

### Verify a TAP proof and get a control entry

```typescript
import { verifyTapProof } from '@peac/mappings-tap';

const result = await verifyTapProof(
  {
    method: 'POST',
    url: 'https://api.example.com/payment',
    headers: {
      'signature-input':
        'sig1=("@method" "@target-uri");created=1700000000;expires=1700000480;keyid="key-1";alg="ed25519";tag="payment"',
      signature: 'sig1=:base64signature:',
    },
  },
  {
    keyResolver: async (issuer, keyid) => publicKeyBytes,
  }
);

if (result.valid) {
  console.log(result.controlEntry); // { engine: 'tap', result: 'allow', evidence: { ... } }
}
```

### Validate TAP-specific constraints

```typescript
import {
  validateTapTimeConstraints,
  validateTapAlgorithm,
  isKnownTapTag,
} from '@peac/mappings-tap';

// Check algorithm
validateTapAlgorithm('ed25519'); // passes
validateTapAlgorithm('rsa-pss-sha256'); // throws TapError

// Check tag
console.log(isKnownTapTag('payment')); // true

// Check time constraints
validateTapTimeConstraints(
  { created: 1700000000, expires: 1700000480, alg: 'ed25519', keyid: 'k1' },
  1700000240 // now
); // passes (within 8-minute window)
```

### Create a denied control entry

```typescript
import { createDeniedControlEntry } from '@peac/mappings-tap';

const entry = createDeniedControlEntry(
  {
    keyid: 'key-1',
    tag: 'payment',
    created: 1700000000,
    expires: 1700000480,
    coveredComponents: ['@method', '@target-uri'],
    signatureBase64: 'abc123',
  },
  'Signature expired'
);

console.log(entry.result); // 'deny'
```

## Integrates With

- `@peac/http-signatures`: HTTP message signature parsing and verification (RFC 9421)
- `@peac/jwks-cache`: JWKS key resolution and caching
- `@peac/control` (Layer 3): Control engine interfaces and control chain types
- `@peac/protocol` (Layer 3): Receipt issuance with embedded control evidence

## For Agent Developers

If you are building an AI agent or MCP server that needs evidence receipts:

- Start with [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for a ready-to-use MCP tool server
- Use `@peac/protocol` for programmatic receipt issuance and verification
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
