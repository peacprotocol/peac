# @peac/capture-node

Node.js durable storage for the PEAC capture pipeline. Filesystem-backed spool store and dedupe index.

## Installation

```bash
pnpm add @peac/capture-node
```

## What It Does

`@peac/capture-node` provides filesystem-backed implementations of the `SpoolStore` and `DedupeIndex` interfaces from `@peac/capture-core`. It handles durable JSONL spool files with fsync-based commit semantics, lockfile-based single-writer guards, corruption detection with read-only fallback, and hard-cap size limits.

## How Do I Use It?

### Create durable storage for a capture session

```typescript
import { createFsSpoolStore, createFsDedupeIndex } from '@peac/capture-node';
import { createCaptureSession, createHasher } from '@peac/capture-core';

const store = await createFsSpoolStore({
  filePath: '/var/peac/spool.jsonl',
  autoCommitIntervalMs: 5000,
});

const dedupe = await createFsDedupeIndex({
  filePath: '/var/peac/dedupe.idx',
});

const session = createCaptureSession({
  store,
  dedupe,
  hasher: createHasher(),
});
```

### Check spool diagnostics

```typescript
import { getFsSpoolDiagnostics } from '@peac/capture-node';

const diag = getFsSpoolDiagnostics(store);
console.log(diag.mode); // 'active' or 'read_only'
console.log(diag.entryCount, diag.fileBytes);
```

### Acquire an explicit lockfile

```typescript
import { acquireLock } from '@peac/capture-node';

const lock = await acquireLock('/var/peac/spool.jsonl.lock', {
  allowStaleLockBreak: true,
});
// ... perform exclusive work ...
await lock.release();
```

## Integrates With

- `@peac/capture-core`: Core capture pipeline types and session orchestration
- `@peac/schema` (Layer 1): Interaction evidence schemas
- `@peac/mcp-server` (Layer 5): MCP tool server that uses capture for evidence recording

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
