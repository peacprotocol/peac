# @peac/worker-cloudflare

PEAC receipt verification worker for Cloudflare Workers. Fail-closed TAP verification with pluggable replay protection via Durable Objects, D1, or KV.

## Installation

```bash
pnpm add @peac/worker-cloudflare
```

## What It Does

`@peac/worker-cloudflare` is a Cloudflare Worker that verifies TAP (Trusted Agent Protocol) signatures and PEAC receipts at the edge. It intercepts incoming requests, validates signatures against a configurable issuer allowlist, enforces nonce replay protection, and forwards verified requests to your origin. Unverified requests receive RFC 9457 `application/problem+json` error responses or 402 Payment Required challenges.

## How Do I Use It?

### Deploy the default worker

The package exports a default worker entry point that reads configuration from environment variables:

```typescript
// src/index.ts
export { default } from '@peac/worker-cloudflare';
```

Set environment variables via `wrangler secret put` or `wrangler.toml`:

```bash
wrangler secret put ISSUER_ALLOWLIST
# Enter: https://issuer1.example.com,https://issuer2.example.com
```

### Use replay protection stores

```typescript
import {
  DurableObjectReplayStore,
  D1ReplayStore,
  KVReplayStore,
  NoOpReplayStore,
  ReplayDurableObject,
} from '@peac/worker-cloudflare';

// Durable Objects (recommended): atomic check-and-set
// D1: strong consistency via SQL
// KV: best-effort only (eventual consistency)
```

### Use configuration and error utilities

```typescript
import {
  parseConfig,
  matchesBypassPath,
  isIssuerAllowed,
  ErrorCodes,
  createErrorResponse,
  createChallengeResponse,
} from '@peac/worker-cloudflare';

const config = parseConfig(env);

if (!isIssuerAllowed(issuerUrl, config)) {
  return createErrorResponse(ErrorCodes.ISSUER_NOT_ALLOWED, 'Issuer rejected');
}
```

## Integrates With

- `@peac/worker-shared`: Runtime-neutral verification logic shared across edge surfaces
- `@peac/http-signatures`: HTTP message signature verification
- `@peac/jwks-cache`: JWKS key resolution and caching
- `@peac/mappings-tap`: TAP-to-PEAC receipt mapping
- `@peac/middleware-nextjs`: Next.js Edge Runtime surface (behavioral parity)

## For Agent Developers

If you are building an AI agent that accesses APIs fronted by this worker:

- Your agent must include valid TAP signatures or PEAC receipts in requests
- Use [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for receipt issuance via MCP
- Use `@peac/protocol` for programmatic receipt creation
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

Deploy via `wrangler deploy`. Security defaults are fail-closed:

- **`ISSUER_ALLOWLIST` is required**: returns 500 if not set (set `UNSAFE_ALLOW_ANY_ISSUER=true` only for development)
- **Unknown TAP tags are rejected**: returns 400 (set `UNSAFE_ALLOW_UNKNOWN_TAGS=true` only for development)
- **Replay protection is required**: returns 401 when nonce is present but no store is configured (set `UNSAFE_ALLOW_NO_REPLAY=true` only for development)

For production replay protection, use Durable Objects (atomic) or D1 (strong consistency). KV is eventually consistent and may allow replays under concurrent load. All replay keys are stored as SHA-256 hashes; raw nonces are never stored.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
