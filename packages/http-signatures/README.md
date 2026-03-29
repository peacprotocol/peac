# @peac/http-signatures

RFC 9421 HTTP Message Signatures parsing and verification. Runtime-neutral with no DOM dependencies.

## Installation

```bash
pnpm add @peac/http-signatures
```

## What It Does

`@peac/http-signatures` implements the RFC 9421 HTTP Message Signatures standard for parsing structured signature headers, building canonical signature base strings, and verifying Ed25519 signatures. It is runtime-neutral and works in Node.js, Deno, and browser environments with WebCrypto support.

## How Do I Use It?

### Parse and verify an HTTP signature

```typescript
import { parseSignature, verifySignature, createWebCryptoVerifier } from '@peac/http-signatures';

const parsed = parseSignature(signatureHeader, signatureInputHeader);

const result = await verifySignature({
  signature: parsed,
  request: { method: 'GET', url: '/resource', headers },
  verifier: createWebCryptoVerifier(publicKey),
});

console.log(result.verified); // true or false
```

### Parse signature input parameters

```typescript
import { parseSignatureInput } from '@peac/http-signatures';

const params = parseSignatureInput(
  'sig1=("@method" "@target-uri" "content-type");created=1704067200;keyid="my-key"'
);
console.log(params.sig1.keyid); // 'my-key'
console.log(params.sig1.created); // 1704067200
```

### Build a signature base for signing

```typescript
import { buildSignatureBase, signatureBaseToBytes } from '@peac/http-signatures';

const base = buildSignatureBase({
  components: ['@method', '@target-uri', 'content-type'],
  request: { method: 'POST', url: '/api', headers },
  params: { created: Math.floor(Date.now() / 1000), keyid: 'my-key' },
});

const bytes = signatureBaseToBytes(base);
```

## Integrates With

- `@peac/jwks-cache`: JWKS-based key resolution for signature verification
- `@peac/server` (Layer 5): Verification server uses HTTP signatures for request authentication
- `@peac/middleware-express`: Express middleware for signature verification

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
