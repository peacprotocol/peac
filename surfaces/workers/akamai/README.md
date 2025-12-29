# @peac/worker-akamai

PEAC receipt verification worker for Akamai EdgeWorkers.

> **PRIVATE**: This package is not published to npm.

## Features

- TAP (Trusted Agent Protocol) verification
- PEAC receipt verification
- Pluggable replay protection (EdgeKV)
- RFC 9457 problem+json error responses
- Configurable issuer allowlist
- Path-based bypass

## Quick Start

```typescript
// main.js
import { onClientRequest, onClientResponse } from './index.js';

export { onClientRequest, onClientResponse };
```

Or with custom configuration:

```typescript
// main.js
import { createOnClientRequest, createOnClientResponse } from './index.js';

export const onClientRequest = createOnClientRequest({
  edgeKV: {
    namespace: 'peac',
    group: 'replay',
  },
});

export const onClientResponse = createOnClientResponse();
```

## Configuration

### Property Manager Variables

| Variable                           | Required | Description                                    |
| ---------------------------------- | -------- | ---------------------------------------------- |
| `PMUSER_ISSUER_ALLOWLIST`          | Yes\*    | Comma-separated list of allowed issuer origins |
| `PMUSER_BYPASS_PATHS`              | No       | Comma-separated list of paths to bypass        |
| `PMUSER_UNSAFE_ALLOW_ANY_ISSUER`   | No       | Set to "true" to allow any issuer (UNSAFE)     |
| `PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS` | No       | Set to "true" to allow unknown TAP tags        |
| `PMUSER_UNSAFE_ALLOW_NO_REPLAY`    | No       | Set to "true" to skip replay protection        |

\*Required unless `PMUSER_UNSAFE_ALLOW_ANY_ISSUER=true`

### Property Manager Configuration

1. Go to your property in Akamai Control Center
2. Add a new behavior: Advanced > EdgeWorkers
3. Select your EdgeWorker bundle
4. Add user-defined variables:

```
PMUSER_ISSUER_ALLOWLIST = https://trusted-issuer.example.com
PMUSER_BYPASS_PATHS = /health,/ready,/metrics
```

### EdgeKV Setup

For replay protection, create an EdgeKV namespace:

1. Go to EdgeKV in Akamai Control Center
2. Create a namespace called `peac`
3. Create a group called `replay`
4. Initialize the EdgeKV token in your EdgeWorker bundle

## Security

### Fail-Closed Defaults

All security features default to fail-closed:

- **ISSUER_ALLOWLIST**: Required. Returns 500 if not configured.
- **Unknown TAP tags**: Rejected with 400. Set `PMUSER_UNSAFE_ALLOW_UNKNOWN_TAGS=true` to allow.
- **Replay protection**: Required when nonce present. Set `PMUSER_UNSAFE_ALLOW_NO_REPLAY=true` to skip.

### Replay Protection

For production, configure EdgeKV for replay protection:

```typescript
const onClientRequest = createOnClientRequest({
  edgeKV: {
    namespace: 'peac',
    group: 'replay',
  },
});
```

Note: EdgeKV is eventually consistent. For stronger guarantees, consider using a shorter TTL or implementing additional validation at origin.

### HTTP Status Codes

| Status | Meaning                    |
| ------ | -------------------------- |
| 400    | Malformed request          |
| 401    | Authentication failed      |
| 402    | Payment/receipt required   |
| 403    | Issuer not in allowlist    |
| 409    | Replay detected            |
| 500    | Server/configuration error |

## Response Headers

On successful verification:

| Header        | Description  |
| ------------- | ------------ |
| X-PEAC-Engine | Always "tap" |

Note: Due to EdgeWorkers limitations, verification metadata is primarily
handled via response headers in `onClientResponse` or at origin.

## Architecture

Uses shared worker core from `surfaces/workers/_shared/core/` for runtime-neutral verification logic. Akamai-specific code is minimal:

- `config.ts` - Property Manager variable parsing
- `errors.ts` - Response creation
- `replay-store.ts` - EdgeKV replay protection
- `index.ts` - Entry point and handlers

## EdgeWorker Lifecycle

The PEAC verifier integrates with Akamai's EdgeWorker lifecycle:

1. **onClientRequest**: Verify TAP headers, return 4xx if invalid
2. **onClientResponse**: Add verification headers to response

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Deployment

1. Bundle the EdgeWorker code
2. Upload to Akamai Control Center
3. Configure Property Manager variables
4. Activate on staging, then production

## License

Apache-2.0

---

Part of [PEAC Protocol](https://peacprotocol.org)
