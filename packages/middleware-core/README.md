# @peac/middleware-core

Framework-agnostic middleware primitives for PEAC receipt issuance. Provides signing, transport selection, and rate limiting for any HTTP framework.

## Installation

```bash
pnpm add @peac/middleware-core
```

## What It Does

`@peac/middleware-core` is a framework-agnostic library for issuing signed PEAC receipts from HTTP servers. It handles receipt creation, transport selection (header, body, or pointer), configuration validation, and rate limiting. Framework-specific packages such as `@peac/middleware-express` build on these primitives.

## How Do I Use It?

### Create a receipt for a request/response pair

```typescript
import { createReceipt, validateConfig } from '@peac/middleware-core';
import type { MiddlewareConfig, RequestContext, ResponseContext } from '@peac/middleware-core';

const config: MiddlewareConfig = {
  issuer: 'https://api.example.com',
  signingKey: privateJwk, // Ed25519 JWK
  keyId: 'prod-2026-02',
};
validateConfig(config);

const result = await createReceipt(config, requestCtx, responseCtx);

for (const [key, value] of Object.entries(result.headers)) {
  res.setHeader(key, value);
}
```

### Select transport and wrap responses

```typescript
import { selectTransport, wrapResponse, buildResponseHeaders } from '@peac/middleware-core';

const transport = selectTransport(receiptJws, config);

if (transport === 'body') {
  const wrapped = wrapResponse(originalData, receiptJws);
  res.json(wrapped); // { data, peac_receipt }
} else {
  const headers = buildResponseHeaders(receiptJws);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}
```

### Use rate limiting

```typescript
import { MemoryRateLimitStore } from '@peac/middleware-core';
import type { RateLimitStore } from '@peac/middleware-core';

const limiter = new MemoryRateLimitStore({
  maxRequests: 100,
  windowMs: 60_000,
});
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants
- `@peac/schema` (Layer 1): Zod validators for receipt claims
- `@peac/crypto` (Layer 2): Ed25519 signing
- `@peac/middleware-express`: Express.js integration built on these primitives

## For Agent Developers

If you are building an AI agent or integration that needs to issue receipts:

- Use `@peac/middleware-express` for Express.js applications
- Use `@peac/middleware-core` directly when integrating with other frameworks (Hono, Koa, Fastify)
- Use `@peac/protocol` for lower-level receipt issuance without HTTP middleware
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

Call `validateConfig()` or `validateConfigAsync()` at application startup to catch configuration errors early. Receipt generation failures are returned in the result rather than thrown, so receipt failures never break HTTP responses. The `MemoryRateLimitStore` is in-process only; for distributed rate limiting, implement the `RateLimitStore` interface with a shared backend.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
