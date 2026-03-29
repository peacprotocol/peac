# @peac/server

PEAC verification server with DoS protection, rate limiting, and circuit breaker resilience.

## Installation

```bash
pnpm add @peac/server
```

## What It Does

`@peac/server` is a production-ready HTTP verification server built on Hono. It exposes a `/verify` endpoint for validating signed interaction receipts, with sliding-window rate limiting (per-IP and global), a circuit breaker for JWKS key fetching, and response caching. It ships as both a library and a CLI binary (`peac-server`).

## How Do I Use It?

### Run the server via CLI

```bash
npx peac-server
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
console.log(`Global requests in window: ${stats.globalCount}`);

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
- `@peac/jwks-cache`: JWKS key resolution with SSRF protection
- `@peac/http-signatures`: RFC 9421 request signature verification

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
