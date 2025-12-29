# @peac/worker-fastly

PEAC receipt verification worker for Fastly Compute.

> **PRIVATE**: This package is not published to npm.

## Features

- TAP (Trusted Agent Protocol) verification
- PEAC receipt verification
- Pluggable replay protection (KV Store)
- RFC 9457 problem+json error responses
- Configurable issuer allowlist
- Path-based bypass

## Quick Start

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

## Configuration

### Edge Dictionary (`peac_config`)

| Key                       | Required | Description                                    |
| ------------------------- | -------- | ---------------------------------------------- |
| `issuer_allowlist`        | Yes*     | Comma-separated list of allowed issuer origins |
| `bypass_paths`            | No       | Comma-separated list of paths to bypass        |
| `unsafe_allow_any_issuer` | No       | Set to "true" to allow any issuer (UNSAFE)     |
| `unsafe_allow_unknown_tags` | No     | Set to "true" to allow unknown TAP tags        |
| `unsafe_allow_no_replay`  | No       | Set to "true" to skip replay protection        |

*Required unless `unsafe_allow_any_issuer=true`

### Example fastly.toml

```toml
manifest_version = 3
name = "peac-verifier"
language = "javascript"

[scripts]
build = "npm run build"

[local_server]
[local_server.backends]
[local_server.backends.origin]
url = "https://your-origin.example.com"

[local_server.dictionaries]
[local_server.dictionaries.peac_config]
format = "inline-toml"
[local_server.dictionaries.peac_config.contents]
issuer_allowlist = "https://trusted-issuer.example.com"
bypass_paths = "/health,/ready"

[local_server.kv_stores]
[local_server.kv_stores.peac_replay]
```

## Security

### Fail-Closed Defaults

All security features default to fail-closed:

- **ISSUER_ALLOWLIST**: Required. Returns 500 if not configured.
- **Unknown TAP tags**: Rejected with 400. Set `unsafe_allow_unknown_tags=true` to allow.
- **Replay protection**: Required when nonce present. Set `unsafe_allow_no_replay=true` to skip.

### Replay Protection

For production, configure a KV Store for replay protection:

```typescript
const handler = createHandler({
  originBackend: 'origin',
  replayKvStore: 'peac_replay', // KV Store name
});
```

### HTTP Status Codes

| Status | Meaning                        |
| ------ | ------------------------------ |
| 400    | Malformed request              |
| 401    | Authentication failed          |
| 402    | Payment/receipt required       |
| 403    | Issuer not in allowlist        |
| 409    | Replay detected                |
| 500    | Server/configuration error     |

## Response Headers

On successful verification:

| Header          | Description                    |
| --------------- | ------------------------------ |
| X-PEAC-Verified | Always "true"                  |
| X-PEAC-Engine   | Always "tap"                   |
| X-PEAC-TAP-Tag  | TAP usage tag (if present)     |
| X-PEAC-Warning  | Warning message (if applicable)|

## Architecture

Uses shared worker core from `surfaces/workers/_shared/core/` for runtime-neutral verification logic. Fastly-specific code is minimal:

- `config.ts` - Edge Dictionary parsing
- `errors.ts` - Response creation
- `replay-store.ts` - KV Store replay protection
- `index.ts` - Entry point and handler

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

Apache-2.0

---

Part of [PEAC Protocol](https://peacprotocol.org)
