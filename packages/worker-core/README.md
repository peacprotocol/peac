# @peac/worker-core

Runtime-neutral TAP verification handler for edge deployments.

## Installation

```bash
pnpm add @peac/worker-core
```

## Overview

This package provides a runtime-neutral handler for TAP (Trusted Agent Protocol) verification. It is used by platform-specific worker packages (Cloudflare, Fastly, Akamai) to ensure consistent verification behavior across all edge deployments.

## Usage

```typescript
import { createHandler, type HandlerConfig } from '@peac/worker-core';

const config: HandlerConfig = {
  mode: 'tap_only', // or 'receipt_or_tap'
  issuerAllowlist: ['https://trusted-issuer.example.com'],
  replayStore: myReplayStore,
};

const handler = createHandler(config);

// Use in your edge worker
const result = await handler.verify(request);
if (!result.ok) {
  return new Response(JSON.stringify(result.problem), {
    status: result.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
```

## Features

- **Runtime neutral**: Works in Cloudflare Workers, Fastly Compute, Akamai EdgeWorkers
- **Fail-closed security**: ISSUER_ALLOWLIST required, replay protection enforced
- **RFC 9457 compliance**: Returns Problem Details for errors
- **LRU replay protection**: True access-order updates for nonce tracking

## Documentation

See [peacprotocol.org](https://www.peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
