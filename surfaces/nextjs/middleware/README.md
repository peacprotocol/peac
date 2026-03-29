# @peac/middleware-nextjs

PEAC TAP verifier and 402 access gate for Next.js Edge Runtime. Fail-closed security defaults with pluggable replay protection.

## Installation

```bash
pnpm add @peac/middleware-nextjs
```

Requires Next.js as a peer dependency (`>=13.0.0`).

## What It Does

`@peac/middleware-nextjs` verifies TAP (Trusted Agent Protocol) signatures and PEAC receipts at the edge in Next.js middleware. It returns 402 Payment Required challenges for unauthenticated requests, enforces issuer allowlists, and provides pluggable nonce replay protection. All error responses use RFC 9457 `application/problem+json` format.

## How Do I Use It?

### Create middleware with `createPeacMiddleware`

```typescript
// middleware.ts
import { createPeacMiddleware, LRUReplayStore } from '@peac/middleware-nextjs';

export const middleware = createPeacMiddleware({
  issuerAllowlist: ['https://trusted-agent.example.com'],
  bypassPaths: ['/api/health', '/public/**'],
  replayStore: new LRUReplayStore(),
});

export const config = {
  matcher: '/api/:path*',
};
```

### Use `withPeacVerification` for custom middleware flows

```typescript
import { NextResponse } from 'next/server';
import { withPeacVerification, LRUReplayStore } from '@peac/middleware-nextjs';

const peacConfig = {
  issuerAllowlist: ['https://trusted-agent.example.com'],
  replayStore: new LRUReplayStore(),
};

export async function middleware(request: NextRequest) {
  const errorResponse = await withPeacVerification(request, peacConfig);
  if (errorResponse) {
    return errorResponse;
  }
  return NextResponse.next();
}
```

### Use lower-level utilities for custom verification

```typescript
import { handleRequest, getVerificationHeaders, ErrorCodes } from '@peac/middleware-nextjs';
import type { HandlerRequest, MiddlewareConfig } from '@peac/middleware-nextjs';

const result = await handleRequest(handlerRequest, config);
if (result !== null) {
  // Handle error or challenge response
  console.log(result.status, result.body);
}
```

## Integrates With

- `@peac/http-signatures`: HTTP message signature verification
- `@peac/jwks-cache`: JWKS key resolution and caching
- `@peac/mappings-tap`: TAP-to-PEAC receipt mapping
- `@peac/worker-cloudflare`: Cloudflare Workers surface (behavioral parity)

## For Agent Developers

If you are building an AI agent that accesses PEAC-gated APIs:

- Your agent must include valid TAP signatures or PEAC receipts in requests
- Use [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for receipt issuance via MCP
- Use `@peac/protocol` for programmatic receipt creation
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

This middleware runs in the Next.js Edge Runtime. Security defaults are fail-closed:

- **Issuer allowlist is required**: returns 500 if empty (set `unsafeAllowAnyIssuer` only for development)
- **Unknown TAP tags are rejected**: returns 400 (set `unsafeAllowUnknownTags` only for development)
- **Replay protection is required**: returns 401 when nonce is present but no store is configured (set `unsafeAllowNoReplay` only for development)

The `LRUReplayStore` is per-isolate only and provides best-effort protection. For production, implement the `ReplayStore` interface with a distributed backend such as Redis or a database.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
