# @peac/capture-core

Runtime-neutral capture pipeline for PEAC interaction evidence. No filesystem dependencies.

## Installation

```bash
pnpm add @peac/capture-core
```

## What It Does

`@peac/capture-core` provides a deterministic, tamper-evident capture pipeline for recording agent interactions as signed evidence. It is runtime-agnostic (no Node.js or filesystem dependencies) and runs in any JavaScript environment with WebCrypto support. Captured actions are chained via SHA-256 digests for integrity verification.

## How Do I Use It?

### Create a capture session and record actions

```typescript
import { createCaptureSession, createHasher } from '@peac/capture-core';
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '@peac/capture-core/testkit';

const session = createCaptureSession({
  store: createInMemorySpoolStore(),
  dedupe: createInMemoryDedupeIndex(),
  hasher: createHasher(),
});

const result = await session.capture({
  id: 'action-001',
  kind: 'tool.call',
  platform: 'my-agent',
  started_at: new Date().toISOString(),
  tool_name: 'web_search',
});

if (result.success) {
  console.log('Captured:', result.entry.entry_digest);
}

await session.close();
```

### Map captured entries to interaction evidence

```typescript
import { toInteractionEvidence, toInteractionEvidenceBatch } from '@peac/capture-core';

const evidence = toInteractionEvidence(spoolEntry);
const batch = toInteractionEvidenceBatch(spoolEntries);
```

### Use protocol constants

```typescript
import { GENESIS_DIGEST, SIZE_CONSTANTS } from '@peac/capture-core';

console.log(GENESIS_DIGEST); // 64 zero characters (chain start sentinel)
console.log(SIZE_CONSTANTS.TRUNC_1M); // 1048576 (truncation threshold)
```

## Integrates With

- `@peac/capture-node`: Filesystem-backed `SpoolStore` and `DedupeIndex` for Node.js
- `@peac/schema` (Layer 1): Interaction evidence schemas
- `@peac/crypto` (Layer 2): Deterministic hashing and canonicalization

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
