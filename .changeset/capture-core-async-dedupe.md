---
'@peac/capture-core': patch
'@peac/crypto': patch
---

## @peac/capture-core

New runtime-neutral capture pipeline for PEAC interaction evidence.

### API Design

**Async DedupeIndex interface**

All `DedupeIndex` methods return `Promise<T>` to support durable backends (SQLite, LevelDB, Redis) without forcing synchronous filesystem access:

```typescript
interface DedupeIndex {
  has(actionId: string): Promise<boolean>;
  get(actionId: string): Promise<DedupeEntry | undefined>;
  set(actionId: string, entry: DedupeEntry): Promise<void>;
  markEmitted(actionId: string): Promise<boolean>;
  delete(actionId: string): Promise<boolean>;
  size(): Promise<number>;
  clear(): Promise<void>;
}
```

**Testkit subpath export**

In-memory implementations are exported from a separate subpath to keep the main API minimal and prevent accidental production usage:

```typescript
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '@peac/capture-core/testkit';
```

### Features

- `capture()` guarantees never-throw behavior - all failures return `CaptureResult`
- Error codes: `E_CAPTURE_DUPLICATE`, `E_CAPTURE_INVALID_ACTION`, `E_CAPTURE_HASH_FAILED`, `E_CAPTURE_STORE_FAILED`, `E_CAPTURE_SESSION_CLOSED`, `E_CAPTURE_INTERNAL`
- Queue safety: concurrent captures are serialized and recoverable after failures
- Deterministic timestamps: `captured_at` derived from action timestamps (`completed_at` or `started_at`), not wall clock time

## @peac/crypto

### Protocol Decision: JCS undefined Handling

Documented the JavaScript `undefined` handling behavior as a normative protocol decision:

- Object properties with undefined values are OMITTED
- Array elements that are undefined become `null`
- Top-level undefined throws an error

This matches `JSON.stringify` behavior and is documented for cross-language interoperability.
