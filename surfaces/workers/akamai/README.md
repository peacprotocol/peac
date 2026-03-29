# @peac/worker-akamai

PEAC receipt verification worker for Akamai EdgeWorkers. Fail-closed TAP verification with EdgeKV replay protection.

## Installation

```bash
pnpm add @peac/worker-akamai
```

## What It Does

`@peac/worker-akamai` is an Akamai EdgeWorker that verifies TAP (Trusted Agent Protocol) signatures and PEAC receipts at the edge. It reads configuration from Property Manager variables (`PMUSER_*`), validates requests against an issuer allowlist, enforces nonce replay protection via EdgeKV, and integrates with Akamai's `onClientRequest`/`onClientResponse` lifecycle. Unverified requests receive RFC 9457 `application/problem+json` error responses or 402 Payment Required challenges.

## How Do I Use It?

### Use the default handlers

```typescript
// main.js
import { onClientRequest, onClientResponse } from '@peac/worker-akamai';

export { onClientRequest, onClientResponse };
```

### Create handlers with custom EdgeKV configuration

```typescript
import { createOnClientRequest, createOnClientResponse } from '@peac/worker-akamai';

export const onClientRequest = createOnClientRequest({
  edgeKV: {
    namespace: 'peac',
    group: 'replay',
  },
});

export const onClientResponse = createOnClientResponse();
```

### Use configuration and error utilities

```typescript
import {
  parseConfig,
  parseConfigFromRecord,
  matchesBypassPath,
  isIssuerAllowed,
  ErrorCodes,
  respondWithError,
  respondWithChallenge,
  createErrorResponse,
  createReplayStore,
  EdgeKVReplayStore,
} from '@peac/worker-akamai';

import type { EWRequest, EWResponse, EWRequestHandler } from '@peac/worker-akamai';
```

## Integrates With

- `@peac/worker-shared`: Runtime-neutral verification logic shared across edge surfaces
- `@peac/http-signatures`: HTTP message signature verification
- `@peac/jwks-cache`: JWKS key resolution and caching
- `@peac/mappings-tap`: TAP-to-PEAC receipt mapping
- `@peac/worker-cloudflare`: Cloudflare Workers surface (behavioral parity)

## For Agent Developers

If you are building an AI agent that accesses APIs fronted by this EdgeWorker:

- Your agent must include valid TAP signatures or PEAC receipts in requests
- Use [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for receipt issuance via MCP
- Use `@peac/protocol` for programmatic receipt creation
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

Configuration is read from Akamai Property Manager user-defined variables. Set `PMUSER_ISSUER_ALLOWLIST` as a comma-separated list of allowed issuer origins. Security defaults are fail-closed:

- **`PMUSER_ISSUER_ALLOWLIST` is required**: returns 500 if not configured (set `PMUSER_UNSAFE_ALLOW_ANY_ISSUER=true` only for development)
- **Unknown TAP tags are rejected**: returns 400 (set `PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS=true` only for development)
- **Replay protection is required**: returns 401 when nonce is present but no store is configured (set `PMUSER_UNSAFE_ALLOW_NO_REPLAY=true` only for development)

For replay protection, create an EdgeKV namespace and group in Akamai Control Center (defaults: namespace `peac`, group `replay`). EdgeKV is eventually consistent; for stronger guarantees, consider a shorter TTL or additional validation at origin. Verification metadata is added via the `onClientResponse` handler.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
