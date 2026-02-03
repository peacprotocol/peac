# @peac/capture-core

Runtime-neutral capture pipeline for PEAC interaction evidence.

## Overview

`@peac/capture-core` provides a deterministic, tamper-evident capture pipeline for recording
agent interactions. It is designed to be runtime-agnostic (no Node.js/filesystem dependencies)
and can run in any JavaScript environment with WebCrypto support.

## Installation

```bash
npm install @peac/capture-core
# or
pnpm add @peac/capture-core
```

## Quick Start

```typescript
import { createCaptureSession, createHasher } from '@peac/capture-core';
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '@peac/capture-core/testkit';

// Create a capture session
const session = createCaptureSession({
  store: createInMemorySpoolStore(),
  dedupe: createInMemoryDedupeIndex(),
  hasher: createHasher(),
});

// Capture an action
const result = await session.capture({
  id: 'action-001',
  kind: 'tool.call',
  platform: 'my-agent',
  started_at: new Date().toISOString(),
  tool_name: 'web_search',
  input_bytes: new TextEncoder().encode('{"query": "hello"}'),
  output_bytes: new TextEncoder().encode('{"results": []}'),
});

if (result.success) {
  console.log('Captured:', result.entry.entry_digest);
}

await session.close();
```

## Determinism Contract

This package guarantees deterministic output for identical inputs. The following behaviors
are normative and MUST NOT change without a wire format version bump.

### Entry Digest Computation

The `entry_digest` is computed by:

1. Serializing the entry (minus `entry_digest` field) using JCS (RFC 8785)
2. Computing SHA-256 of the canonical JSON bytes
3. Encoding as lowercase hex (64 characters)

**Fields included in hash:**

- `captured_at` (RFC 3339 timestamp)
- `action` (full action object, minus `input_bytes`/`output_bytes`)
- `input_digest` (if present)
- `output_digest` (if present)
- `prev_entry_digest` (chain linkage)
- `sequence` (monotonic counter)

### Genesis Digest

The first entry in a chain has `prev_entry_digest` set to `GENESIS_DIGEST`, a
**protocol-defined sentinel value** consisting of 64 zero characters:

```text
0000000000000000000000000000000000000000000000000000000000000000
```

This is NOT the SHA-256 hash of an empty string (which would be `e3b0c44...`).
It is an arbitrary constant chosen to be obviously distinguishable and to
simplify chain verification (check for all-zeros rather than compute a hash).

### Timestamp Derivation

`captured_at` is derived deterministically from action timestamps:

```typescript
captured_at = action.completed_at ?? action.started_at
```

This ensures the same action stream produces identical chain digests across sessions.
Wall-clock time is NOT used.

**Monotonicity caveat:** `captured_at` values may be non-monotonic (out of order) even
though the chain is strictly ordered by sequence number. This can happen when actions
complete in a different order than they started. The chain ordering is by invocation
order, NOT by timestamp order.

### Payload Hashing

Payloads are hashed according to truncation thresholds:

| Size | Algorithm | Label |
|------|-----------|-------|
| <= 1MB | Full SHA-256 | `sha-256` |
| > 1MB | First 1MB SHA-256 | `sha-256:trunc-1m` |

The `bytes` field always contains the original payload size (for audit).

### JCS Canonicalization

JSON canonicalization follows RFC 8785 with JavaScript-specific `undefined` handling:

- Object properties with `undefined` values are **omitted**
- Array elements that are `undefined` become **`null`**
- Top-level `undefined` **throws an error**

This matches `JSON.stringify` behavior. See `@peac/crypto` documentation for details.

## Concurrency Contract

### Single-Writer Per Session

Each `CaptureSession` instance maintains internal state (sequence number, head digest)
that is NOT thread-safe across multiple sessions. For concurrent agents:

- Create one session per agent/workflow
- Do NOT share sessions across async boundaries without serialization

### Capture Serialization

Concurrent `capture()` calls on the same session are automatically serialized:

```typescript
// These run sequentially (not in parallel) to maintain chain integrity
const [r1, r2, r3] = await Promise.all([
  session.capture(action1),
  session.capture(action2),
  session.capture(action3),
]);
```

**Ordering:** Captures are ordered by invocation time (when `capture()` was called),
NOT by action timestamps. If timestamp-ordered chains are required, sort actions
before capturing.

### Never-Throw Guarantee

`capture()` NEVER throws exceptions. All failures are returned as `CaptureResult`:

```typescript
const result = await session.capture(action);
if (!result.success) {
  console.error(result.code, result.message);
}
```

Error codes:
- `E_CAPTURE_DUPLICATE` - Action ID already captured
- `E_CAPTURE_INVALID_ACTION` - Missing required fields
- `E_CAPTURE_HASH_FAILED` - Hashing operation failed
- `E_CAPTURE_STORE_FAILED` - Storage backend failed
- `E_CAPTURE_SESSION_CLOSED` - Session was closed
- `E_CAPTURE_INTERNAL` - Unexpected internal error

### Queue Recovery

If a capture fails, subsequent captures can still succeed. The queue is designed to
be resilient:

```typescript
const r1 = await session.capture(badAction);  // Fails
const r2 = await session.capture(goodAction); // Succeeds (queue not wedged)
```

### Session Lifecycle and close()

The `close()` method releases session resources. Its behavior is:

**Semantics:**
- **Immediate:** `close()` does NOT wait for in-flight captures to drain. Any
  capture already in progress may complete or fail.
- **Idempotent:** Multiple `close()` calls are safe and have no additional effect.
- **Terminal:** After `close()`, all subsequent `capture()` calls return
  `E_CAPTURE_SESSION_CLOSED` (never throw).

**Best practice:** Wait for all captures to complete before closing:

```typescript
// Good: wait for captures, then close
const results = await Promise.all([
  session.capture(action1),
  session.capture(action2),
]);
await session.close();

// Risky: closing while captures in-flight
session.capture(action1);  // May or may not complete
await session.close();     // Immediate - doesn't wait
```

**Resource cleanup:** `close()` calls `store.close()` on the underlying SpoolStore.
Custom SpoolStore implementations should release file handles, database connections,
or other resources in their `close()` method.

## API Reference

### Main Exports

```typescript
import {
  // Constants
  GENESIS_DIGEST,    // Protocol-defined sentinel: 64 zeros (NOT sha256 of empty)
  SIZE_CONSTANTS,    // { TRUNC_64K: 65536, TRUNC_1M: 1048576 }

  // Factories
  createHasher,         // Create a Hasher instance
  createCaptureSession, // Create a CaptureSession

  // Mappers
  toInteractionEvidence,      // SpoolEntry -> InteractionEvidenceV01
  toInteractionEvidenceBatch, // SpoolEntry[] -> InteractionEvidenceV01[]

  // Types
  type CapturedAction,
  type SpoolEntry,
  type CaptureResult,
  type Hasher,
  type SpoolStore,
  type DedupeIndex,
} from '@peac/capture-core';
```

### Testkit Exports

For testing only. Do NOT use in production:

```typescript
import {
  createInMemorySpoolStore,
  createInMemoryDedupeIndex,
  InMemorySpoolStore,
  InMemoryDedupeIndex,
} from '@peac/capture-core/testkit';
```

## Implementing Custom Backends

### SpoolStore

```typescript
interface SpoolStore {
  append(entry: SpoolEntry): Promise<void>;
  getHeadDigest(): Promise<string>;
  getSequence(): Promise<number>;
  commit(): Promise<void>;
  close(): Promise<void>;
}
```

### DedupeIndex

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

## Module Format

This package ships **CommonJS** output. ESM `import` is supported via Node's CJS interop:

```typescript
// Both work
import { createCaptureSession } from '@peac/capture-core';      // ESM (Node synthesizes default)
const { createCaptureSession } = require('@peac/capture-core'); // CJS
```

## Runtime Requirements

- **WebCrypto API**: `crypto.subtle` must be available
- Supported environments: Node.js 18+, Deno, Bun, modern browsers, Cloudflare Workers

## License

Apache-2.0
