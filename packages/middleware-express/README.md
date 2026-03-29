# @peac/middleware-express

Express.js middleware for automatic PEAC receipt issuance. Adds signed receipts to HTTP responses with zero application code changes.

## Installation

```bash
pnpm add @peac/middleware-express
```

Requires Express as a peer dependency (`^4.18.0 || ^5.0.0`).

## What It Does

`@peac/middleware-express` is an Express.js middleware that automatically attaches signed PEAC receipts to HTTP responses. It wraps `@peac/middleware-core` with Express-specific request/response handling, route skipping, and error isolation. Receipt generation failures never break the HTTP response.

## How Do I Use It?

### Add receipt issuance to an Express app

```typescript
import express from 'express';
import { peacMiddleware } from '@peac/middleware-express';

const app = express();

app.use(
  peacMiddleware({
    issuer: 'https://api.example.com',
    signingKey: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: '<base64url public key>',
      d: '<base64url private key>',
    },
    keyId: 'prod-2026-02',
    skip: (req) => req.path === '/health',
  })
);

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello World' });
  // PEAC-Receipt header automatically added
});
```

### Check receipt context on a request

```typescript
import { hasPeacContext, getReceiptFromResponse } from '@peac/middleware-express';
import type { RequestWithPeacContext } from '@peac/middleware-express';

if (hasPeacContext(req)) {
  // Request has PEAC context attached by middleware
}

// Extract receipt from response (useful for testing)
const receipt = getReceiptFromResponse(res);
```

### Use the synchronous variant

```typescript
import { peacMiddlewareSync } from '@peac/middleware-express';

app.use(
  peacMiddlewareSync({
    issuer: 'https://api.example.com',
    signingKey: privateJwk,
    keyId: 'prod-2026-02',
  })
);
```

## Integrates With

- `@peac/middleware-core`: Framework-agnostic primitives (signing, transport, config validation)
- `@peac/kernel` (Layer 0): Types and constants (via middleware-core)
- `@peac/schema` (Layer 1): Zod validators (via middleware-core)
- `@peac/crypto` (Layer 2): Ed25519 signing (via middleware-core)

## For Agent Developers

If you are building an AI agent or service that issues receipts:

- Add `peacMiddleware()` to your Express app and receipts are issued automatically
- Use `@peac/middleware-core` directly for non-Express frameworks
- Use `@peac/protocol` for lower-level receipt issuance without HTTP middleware
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

All `@peac/middleware-core` configuration options are supported (issuer, signingKey, keyId, expiresIn, transport, maxHeaderSize). Additional Express-specific options:

- **`skip`**: predicate function to skip receipt generation for certain routes (such as health checks)
- **`audienceExtractor`**: custom audience extraction from the request (default: request origin)
- **`subjectExtractor`**: custom subject extraction from the request
- **`onError`**: custom error handler for receipt generation failures (default: console logging)

Receipt generation failures are isolated and never break the HTTP response.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
