# @peac/jwks-cache

Edge-safe JWKS fetch and cache with SSRF protection for PEAC receipt verification.

## Installation

```bash
pnpm add @peac/jwks-cache
```

## What It Does

`@peac/jwks-cache` provides a secure JWKS (JSON Web Key Set) resolver with built-in SSRF prevention, in-memory caching with Cache-Control awareness, and Ed25519 key import. It validates URLs against metadata IP ranges before fetching and caches resolved keys to minimize network requests during receipt verification.

## How Do I Use It?

### Create a JWKS resolver and look up a key

```typescript
import { createResolver, resolveKey } from '@peac/jwks-cache';

const resolver = createResolver({
  cacheTtlMs: 300_000, // 5 minutes
});

const key = await resolveKey(resolver, {
  jwksUri: 'https://issuer.example.com/.well-known/jwks.json',
  kid: 'key-2026-03',
});

console.log(key.algorithm); // 'Ed25519'
```

### Validate a URL for SSRF safety

```typescript
import { validateUrl, isMetadataIp } from '@peac/jwks-cache';

validateUrl('https://issuer.example.com/.well-known/jwks.json'); // passes
validateUrl('http://169.254.169.254/latest/meta-data'); // throws: metadata IP
```

### Use the in-memory cache directly

```typescript
import { InMemoryCache, buildJwksCacheKey } from '@peac/jwks-cache';

const cache = new InMemoryCache({ maxEntries: 100 });

const cacheKey = buildJwksCacheKey('https://issuer.example.com/.well-known/jwks.json', 'key-1');
await cache.set(cacheKey, { jwk, expiresAt: Date.now() + 300_000 });
```

## Integrates With

- `@peac/http-signatures`: Key resolution for RFC 9421 signature verification
- `@peac/protocol` (Layer 3): Receipt verification with remote key resolution
- `@peac/server` (Layer 5): Verification server JWKS fetching with circuit breaker

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
