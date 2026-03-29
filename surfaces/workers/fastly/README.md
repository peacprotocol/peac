# @peac/worker-fastly

PEAC receipt verification worker for Fastly Compute. Fail-closed TAP verification with KV Store replay protection.

## Installation

```bash
pnpm add @peac/worker-fastly
```

## What It Does

`@peac/worker-fastly` is a Fastly Compute worker that verifies TAP (Trusted Agent Protocol) signatures and PEAC receipts at the edge. It reads configuration from Fastly Edge Dictionaries, validates requests against an issuer allowlist, enforces nonce replay protection via KV Store, and forwards verified requests to your origin backend. Unverified requests receive RFC 9457 `application/problem+json` error responses or 402 Payment Required challenges.

## How Do I Use It?

### Create a handler with custom backend configuration

```typescript
import { createHandler } from '@peac/worker-fastly';

const handler = createHandler({
  originBackend: 'origin',
  configDictName: 'peac_config',
  replayKvStore: 'peac_replay',
});

addEventListener('fetch', (event) => {
  event.respondWith(handler(event.request));
});
```

### Use the default handler for simple deployments

```typescript
import { defaultHandler } from '@peac/worker-fastly';

addEventListener('fetch', (event) => {
  event.respondWith(defaultHandler(event.request));
});
```

### Use replay protection stores and configuration utilities

```typescript
import {
  createReplayStore,
  KVStoreReplayStore,
  InMemoryReplayStore,
  NoOpReplayStore,
  parseConfig,
  matchesBypassPath,
  isIssuerAllowed,
  ErrorCodes,
} from '@peac/worker-fastly';

const replayStore = createReplayStore('peac_replay');
const config = parseConfig('peac_config');
```

## Integrates With

- `@peac/worker-shared`: Runtime-neutral verification logic shared across edge surfaces
- `@peac/http-signatures`: HTTP message signature verification
- `@peac/jwks-cache`: JWKS key resolution and caching
- `@peac/mappings-tap`: TAP-to-PEAC receipt mapping
- `@peac/worker-cloudflare`: Cloudflare Workers surface (behavioral parity)

## For Agent Developers

If you are building an AI agent that accesses APIs fronted by this worker:

- Your agent must include valid TAP signatures or PEAC receipts in requests
- Use [`@peac/mcp-server`](https://www.npmjs.com/package/@peac/mcp-server) for receipt issuance via MCP
- Use `@peac/protocol` for programmatic receipt creation
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## For Operators

Configuration is read from a Fastly Edge Dictionary (default name: `peac_config`). Set `issuer_allowlist` as a comma-separated list of allowed issuer origins. Security defaults are fail-closed:

- **`issuer_allowlist` is required**: returns 500 if not configured (set `unsafe_allow_any_issuer=true` only for development)
- **Unknown TAP tags are rejected**: returns 400 (set `unsafe_allow_unknown_tags=true` only for development)
- **Replay protection is required**: returns 401 when nonce is present but no store is configured (set `unsafe_allow_no_replay=true` only for development)

Configure a KV Store (default name: `peac_replay`) for replay protection. Define your origin backend in `fastly.toml` and pass its name as `originBackend` when creating the handler.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
