# @peac/core

> **DEPRECATED. Removal scheduled for v0.13.0.**
> Use `@peac/kernel`, `@peac/schema`, `@peac/crypto`, and `@peac/protocol` instead.
> See `docs/MIGRATION_CURRENT.md` for migration guide.

## Installation

```bash
pnpm add @peac/core
```

## What It Does

`@peac/core` was the original monolithic package that bundled signing, verification, policy enforcement, and utilities. It has been replaced by the kernel-first package architecture. This package re-exports legacy functions for backward compatibility and will be removed in a future release.

## How Do I Use It?

Migrate to the kernel-first packages:

### Signing (migrate to `@peac/crypto` and `@peac/protocol`)

```typescript
// Before (deprecated)
import { signReceipt, createAndSignReceipt } from '@peac/core';

// After
import { signWire02 } from '@peac/crypto';
import { issueWire02 } from '@peac/protocol';
```

### Verification (migrate to `@peac/protocol`)

```typescript
// Before (deprecated)
import { verifyReceipt } from '@peac/core';

// After
import { verifyLocal } from '@peac/protocol';
```

### Constants (migrate to `@peac/kernel`)

```typescript
// Before (deprecated)
import { WIRE } from '@peac/core';

// After
import { WIRE_VERSION, WIRE_TYPE, HEADERS } from '@peac/kernel';
```

## Integrates With

These packages replace `@peac/core`:

- `@peac/kernel` (Layer 0): Constants, types, error codes
- `@peac/schema` (Layer 1): Zod schemas and validation
- `@peac/crypto` (Layer 2): Signing and verification
- `@peac/protocol` (Layer 3): High-level issuance and verification API

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
