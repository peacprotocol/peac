# @peac/server

PEAC verification server with DoS protection, rate limiting, and circuit breaker resilience.

## Installation

`@peac/server` is not published from this repository; build it from source here with `pnpm --filter @peac/server build`. To verify records locally, use `verifyLocal()` from `@peac/protocol` or the `peac` CLI.

## What It Does

`@peac/server` is a production-ready HTTP verification server built on Hono. It exposes a `/verify` endpoint for validating signed interaction receipts, with sliding-window rate limiting (per-IP and global) and a circuit breaker for JWKS key fetching. It ships as both a library and a CLI binary (`peac-server`).

Verification results are not cached: each request is verified on its own and `/verify` responses carry `Cache-Control: no-store`. Issuer key material is cached by the JWKS resolver in `@peac/protocol`. A request body over 32 KiB is rejected with `413` (`application/problem+json`) before it is parsed, and a body that is not valid JSON is rejected with `400`.

## How Do I Use It?

### Run the server via CLI

```bash
pnpm --filter @peac/server build
pnpm --filter @peac/server start
```

### Use the Hono app programmatically

```typescript
import { app } from '@peac/server';
import { serve } from '@hono/node-server';

serve({ fetch: app.fetch, port: 3000 });
console.log('PEAC verification server running on port 3000');
```

### Monitor rate limiter and circuit breaker state

```typescript
import { getRateLimiterStats, CircuitBreaker } from '@peac/server';

const stats = getRateLimiterStats();
console.log(`Global requests in window: ${stats.global}`);

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  openDurationMs: 60_000,
  halfOpenRequests: 3,
});

const result = await breaker.execute(() => fetchJwks(uri));
```

## Integrates With

- `@peac/protocol` (Layer 3): Receipt verification logic
- `@peac/schema` (Layer 1): Request validation schemas

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
