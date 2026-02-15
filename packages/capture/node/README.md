# @peac/capture-node

Node.js durable storage for the PEAC capture pipeline. Provides filesystem-backed implementations of the `SpoolStore` and `DedupeIndex` interfaces from `@peac/capture-core`.

## Install

```bash
npm install @peac/capture-node @peac/capture-core
```

## Usage

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

## Durability Contract

- **`append()`** writes to the OS page cache (no fsync). Fast, but not crash-safe on its own.
- **`commit()`** calls fsync -- the explicit durability point. Entries written before the last `commit()` survive crashes. Entries after may be lost.
- **Auto-commit timer** (default 5s) calls `commit()` periodically when dirty. Prevents long unflushed windows. Set `autoCommitIntervalMs: 0` to disable.

### Commit Ordering

When used with a dedupe index:

1. Spool `commit()` first (authoritative evidence log)
2. Dedupe `commit()` second (best-effort optimization index)

If dedupe commit fails after spool commit, worst case is re-emitting some receipts after restart. No evidence is lost. The dedupe index is disposable -- it can be deleted and rebuilt from the spool.

## Corruption Boundaries

- **Incomplete last line** (crash artifact): automatically truncated on startup. `onWarning` callback fired.
- **Malformed JSON mid-file**: spool marked corrupt. No auto-repair -- mid-file corruption could indicate tampering.
- **Chain linkage broken**: spool marked corrupt. `prev_entry_digest` chain failed verification.
- **Oversized line** (exceeds `maxLineBytes`): spool marked corrupt. Line was never materialized as a JS string.

When corrupt, the spool enters **read-only mode**: new captures are blocked, but export/verify/query tools still operate so the operator can recover salvageable data.

### Pre-Materialization Line Guard

The streaming line parser enforces `maxLineBytes` (default 4MB) at the Buffer level, BEFORE converting to a JS string. A single giant line in a spool file cannot cause an OOM crash.

## Diagnostics

```typescript
import { getFsSpoolDiagnostics } from '@peac/capture-node';

const diag = getFsSpoolDiagnostics(store);
// {
//   mode: 'active' | 'read_only',
//   spoolFull: boolean,
//   spoolCorrupt: boolean,
//   corruptReason?: 'CHAIN_BROKEN' | 'MALFORMED_JSON' | 'LINE_TOO_LARGE',
//   corruptAtSequence?: number,
//   entryCount, fileBytes, maxEntries, maxFileBytes, filePath
// }
```

## Hard-Cap Limits

- `maxEntries` (default: 100,000)
- `maxFileBytes` (default: 100MB)

When exceeded, `append()` throws `SpoolFullError`. The session returns `E_CAPTURE_STORE_FAILED` with a clear message. The adapter stays running (hooks, tools) -- only new captures are blocked.

## Reset Procedure

1. Export the evidence bundle (if any salvageable data)
2. Stop the plugin/adapter
3. Delete: `spool.jsonl`, `spool.jsonl.meta.json`, `dedupe.idx`, `*.lock`
4. Restart

## Single-Writer Guard

A lockfile (`spool.jsonl.lock`) prevents concurrent writers. Default: fail loudly if lock exists. Stale lock break is opt-in via `lockOptions.allowStaleLockBreak`.

## License

Apache-2.0
