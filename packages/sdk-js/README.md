# @peac/sdk

PEAC client SDK with discover/verify functions.

## Installation

```bash
pnpm add @peac/sdk
```

## Usage

### Quick Start

```typescript
import { discover, verify } from '@peac/sdk';

// Discover PEAC endpoints for a domain
const discovery = await discover('https://example.com');

// Verify a PEAC receipt
const result = await verify(receiptJws, { keys: publicKeys });
```

### PeacClient Class

For more control, use the `PeacClient` class:

```typescript
import { PeacClient } from '@peac/sdk';

const client = new PeacClient({
  defaultKeys: { 'key-id': publicKey },
  timeout: 10000,
  retries: 2,
});

// Discover PEAC endpoints
const discovery = await client.discover('https://example.com');

// Verify locally with provided keys
const localResult = await client.verifyLocal(receiptJws);

// Verify via remote endpoint
const remoteResult = await client.verifyRemote(receiptJws, 'https://api.example.com/verify');

// Auto-detect: tries local first, falls back to remote
const result = await client.verify(receiptJws);
```

## API

### Functions

- `discover(origin, options?)` - Discover PEAC endpoints for a domain
- `verify(receipt, keysOrOptions?)` - Verify a receipt (auto-detect local/remote)
- `verifyLocal(receipt, keys, options?)` - Verify locally with provided keys
- `verifyRemote(receipt, endpoint?, options?)` - Verify via remote endpoint

### PeacClient Methods

- `discover(origin, options?)` - Discover with caching
- `verifyLocal(receipt, options?)` - Local verification
- `verifyRemote(receipt, endpoint?, options?)` - Remote verification
- `verify(receipt, options?)` - Auto-detect verification
- `clearCache()` - Clear discovery cache

## Related Packages

- `@peac/core` - Core verification functions
- `@peac/disc` - Discovery module
- `@peac/protocol` - Protocol definitions

## Documentation

- [PEAC Architecture](../../docs/ARCHITECTURE.md)
- [Specification Index](../../docs/SPEC_INDEX.md)

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Originary](https://www.originary.xyz) | [Docs](https://peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac)
