# @peac/middleware-express

Express.js middleware for automatic PEAC receipt issuance.

## Installation

```bash
pnpm add @peac/middleware-express
```

Requires Express as a peer dependency (`^4.18.0 || ^5.0.0`).

## Quick Start

```typescript
import express from 'express';
import { peacMiddleware } from '@peac/middleware-express';

const app = express();

app.use(peacMiddleware({
  issuer: 'https://api.example.com',
  signingKey: {
    kty: 'OKP',
    crv: 'Ed25519',
    x: '<base64url public key>',
    d: '<base64url private key>',
  },
  keyId: 'prod-2026-02',
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello World' });
  // PEAC-Receipt header automatically added
});
```

## API

### `peacMiddleware(config)`

Returns Express middleware that automatically adds PEAC receipts to responses.

```typescript
interface ExpressMiddlewareConfig extends MiddlewareConfig {
  skip?: (req: Request) => boolean;
  audienceExtractor?: (req: Request) => string;
  subjectExtractor?: (req: Request) => string | undefined;
  onError?: (error: Error, req: Request, res: Response) => void;
}
```

### `peacMiddlewareSync(config)`

Synchronous variant for simpler setups where async signing is not needed.

### `getReceiptFromResponse(res)`

Extract the PEAC receipt from a response (for testing/debugging).

### `hasPeacContext(req)`

Type guard checking if the request has PEAC context attached.

## Configuration Options

- **`skip`** -- Skip receipt generation for certain routes (e.g., health checks)
- **`audienceExtractor`** -- Custom audience extraction from request (default: request origin)
- **`subjectExtractor`** -- Custom subject extraction from request
- **`onError`** -- Error handler for receipt generation failures (failures never break the response)

All options from `@peac/middleware-core` `MiddlewareConfig` are also supported (issuer, signingKey, keyId, expiresIn, transport, maxHeaderSize).

## Error Handling

Receipt generation failures are isolated -- they never break the HTTP response. By default, errors are logged to console. Provide an `onError` callback for custom handling.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
