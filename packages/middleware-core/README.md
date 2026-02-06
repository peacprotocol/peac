# @peac/middleware-core

Framework-agnostic middleware primitives for PEAC receipt issuance.

## Installation

```bash
pnpm add @peac/middleware-core
```

## Quick Start

```typescript
import { createReceipt, validateConfig } from '@peac/middleware-core';

// Validate configuration at startup
const config = {
  issuer: 'https://api.example.com',
  signingKey: privateJwk,  // Ed25519 JWK
  keyId: 'prod-2026-02',
};
validateConfig(config);

// In a request handler
const result = await createReceipt(config, requestCtx, responseCtx);

// Add PEAC-Receipt header to response
for (const [key, value] of Object.entries(result.headers)) {
  res.setHeader(key, value);
}
```

## API

### `createReceipt(config, request, response)`

Create a signed PEAC receipt for a request/response pair. Returns a `ReceiptResult` with the JWS receipt, transport headers, and optional body wrapper.

### `createReceiptWithClaims(config, claims)`

Create a receipt from explicit claims (bypasses request/response context extraction).

### `wrapResponse(data, receipt)`

Wrap a response body with a PEAC receipt for body transport profile. Returns `{ data, peac_receipt }`.

### `selectTransport(receipt, config)`

Determine appropriate transport based on receipt size: `'header'`, `'body'`, or `'pointer'`. Auto-falls back from header to body if receipt exceeds `maxHeaderSize` (default 4096 bytes).

### `validateConfig(config)` / `validateConfigAsync(config)`

Validate middleware configuration at startup. Throws `ConfigError` if configuration is invalid.

### `buildResponseHeaders(receipt)` / `buildReceiptResult(receipt, transport, body?)`

Lower-level utilities for constructing response headers and receipt results.

## Configuration

```typescript
interface MiddlewareConfig {
  issuer: string;           // Issuer URL (becomes `iss` claim)
  signingKey: Ed25519PrivateJwk;  // Ed25519 private key (JWK format)
  keyId: string;            // Key ID for JWKS lookup
  expiresIn?: number;       // Receipt expiration in seconds (default: 300)
  transport?: 'header' | 'body' | 'pointer';  // Transport profile (default: 'header')
  maxHeaderSize?: number;   // Max header size before fallback (default: 4096)
  pointerUrlGenerator?: (receipt: string) => Promise<string>;
  claimsGenerator?: (context: RequestContext) => Promise<Partial<ReceiptClaimsInput>>;
}
```

## Error Handling

Configuration errors throw `ConfigError` at startup. Receipt generation errors are returned in the result rather than thrown, so receipt failures never break the HTTP response.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
