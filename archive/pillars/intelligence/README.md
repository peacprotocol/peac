# @peac/intelligence — ARCHIVED (empty pillar stub, v0.13.0)

> **ARCHIVED (v0.13.0).** `@peac/intelligence` was an empty Layer-6 pillar
> stub in v0.12.14 (workspace-internal, never published to npm `latest`).
> As part of the v0.13.0 package-surface reduction pass (see
> `docs/PACKAGE_STATUS.md` and plan §4.2 success criteria:
> _"no empty Layer-6 pillar stub remains on the public surface"_), the
> workspace entry was removed and the source was moved from
> `packages/intelligence/` to `archive/pillars/intelligence/`.
>
> **This package is NOT published** at v0.13.0 or later. It was never
> published at v0.12.14. No throwing-stub replacement is published. No
> migration is required for external consumers, because none existed.
>
> The intelligence pillar concept remains part of the PEAC 10-pillar taxonomy.
> When a concrete implementation is designed for a future release (v1.0+
> watchlist), a new `packages/intelligence/` directory will be created with
> real content and an explicit rationale in `docs/PACKAGE_STATUS.md`.
> Until then, the pillar is a taxonomy label, not a shipped package.
>
> Below this banner is the historical README preserved verbatim for
> archaeology. It described the (unshipped) intent; it is no longer
> authoritative.

---

## Historical README (pre-archive)

# @peac/intelligence

PEAC intelligence pillar: reserved package for analytics and insight evidence types.

## Installation

```bash
pnpm add @peac/intelligence
```

## What It Does

`@peac/intelligence` is a reserved pillar package for intelligence and analytics evidence in the PEAC protocol. Intelligence evidence records observations about interaction patterns, usage analytics, and derived insights, providing a signed audit trail for data-driven decisions. This package is currently a namespace placeholder; future releases will add intelligence-specific schemas and utilities.

## How Do I Use It?

Intelligence evidence can be issued today using the protocol layer with custom types:

### Issue intelligence evidence with the protocol layer

```typescript
import { issueWire02 } from '@peac/protocol';

const receipt = await issueWire02({
  type: 'com.example/usage-analytics',
  kind: 'evidence',
  pillars: ['purpose'],
  // ...
});
```

### Verify an intelligence evidence receipt

```typescript
import { verifyLocal } from '@peac/protocol';

const result = await verifyLocal(receiptJws, {
  publicKey: issuerPublicKey,
  expectedIss: 'https://analytics.example.com',
});

console.log(result.status); // 'verified'
```

### Use kernel constants for intelligence-related types

```typescript
import { REGISTERED_RECEIPT_TYPES } from '@peac/kernel';

// Custom types use reverse-DNS naming: 'com.example/usage-analytics'
```

## Integrates With

- `@peac/protocol` (Layer 3): Receipt issuance and verification
- `@peac/schema` (Layer 1): Zod schemas for receipt validation
- `@peac/kernel` (Layer 0): Constants and type definitions

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
