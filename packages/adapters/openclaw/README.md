# @peac/adapter-openclaw

OpenClaw adapter for PEAC interaction evidence capture.

## Overview

`@peac/adapter-openclaw` provides a complete capture pipeline for recording OpenClaw tool calls as PEAC interaction evidence. It includes:

- **Mapper**: OpenClaw tool call events -> PEAC `CapturedAction`
- **Hooks**: Sync capture bindings (< 10ms target)
- **Emitter**: Background receipt signing and persistence
- **Tailer**: Session history fallback for resilience

## Installation

```bash
pnpm add @peac/adapter-openclaw
```

## Quick Start

```typescript
import { createCaptureSession, createHasher } from '@peac/capture-core';
import { createInMemorySpoolStore, createInMemoryDedupeIndex } from '@peac/capture-core/testkit';
import { createHookHandler, mapToolCallEvent } from '@peac/adapter-openclaw';

// Create a capture session
const session = createCaptureSession({
  store: createInMemorySpoolStore(),
  dedupe: createInMemoryDedupeIndex(),
  hasher: createHasher(),
});

// Create a hook handler
const handler = createHookHandler({
  session,
  config: {
    platform: 'openclaw',
    platform_version: '0.2.0',
  },
});

// Handle OpenClaw tool call events
const result = await handler.afterToolCall({
  tool_call_id: 'call_123',
  run_id: 'run_abc',
  tool_name: 'web_search',
  started_at: '2024-02-01T10:00:00Z',
  completed_at: '2024-02-01T10:00:01Z',
  status: 'ok',
  input: { query: 'hello world' },
  output: { results: ['result1'] },
});

if (result.success) {
  console.log('Captured:', result.entry.entry_digest);
}

await handler.close();
```

## Architecture

### Two-Stage Pipeline

1. **Capture Stage** (sync, < 10ms target)
   - Map OpenClaw event to `CapturedAction`
   - Hash payloads inline (truncate large payloads)
   - Write to tamper-evident spool

2. **Emit Stage** (async background)
   - Drain spool periodically
   - Convert to `InteractionEvidenceV01`
   - Sign with configured key
   - Write receipt to output

### OpenClaw to PEAC Mapping

| OpenClaw Concept      | PEAC Location               |
| --------------------- | --------------------------- |
| Session key           | `workflow_id` (correlation) |
| Run ID + tool_call_id | `interaction_id` (dedupe)   |
| Tool call params      | `input.digest`              |
| Tool call result      | `output.digest`             |
| Tool name             | `tool.name`                 |
| Sandbox mode          | `policy.sandbox_enabled`    |
| Elevated flag         | `policy.elevated`           |

## API Reference

### Mapper

```typescript
import { mapToolCallEvent, mapToolCallEventBatch } from '@peac/adapter-openclaw';

// Map single event
const result = mapToolCallEvent(event, config);
if (result.success) {
  console.log(result.action);
}

// Map batch
const results = mapToolCallEventBatch(events, config);
```

### Hook Handler

```typescript
import { createHookHandler, captureBatch, captureParallel } from '@peac/adapter-openclaw';

const handler = createHookHandler({
  session,
  config: { platform: 'openclaw' },
  onCapture: (result, event) => {
    console.log('Captured:', result);
  },
});

// Single event
await handler.afterToolCall(event);

// Batch (sequential)
await captureBatch(handler, events);

// Batch (parallel - non-deterministic order)
await captureParallel(handler, events);
```

### Background Emitter

```typescript
import { createReceiptEmitter, createBackgroundService } from '@peac/adapter-openclaw';

const emitter = createReceiptEmitter({
  signer,
  writer,
  config: { platform: 'openclaw' },
});

const service = createBackgroundService({
  emitter,
  getPendingEntries: () => spoolStore.getPending(),
  markEmitted: (digest) => dedupeIndex.markEmitted(digest),
  drainIntervalMs: 1000,
});

service.start();
// ... later
service.stop();
```

### Session History Tailer (Fallback)

```typescript
import { createSessionHistoryTailer } from '@peac/adapter-openclaw';

const tailer = createSessionHistoryTailer({
  handler,
  sessionId: 'session_123',
  fetchHistory: async (sessionId, afterEventId) => {
    return openclaw.sessions.getHistory(sessionId, { after: afterEventId });
  },
  pollIntervalMs: 1000,
});

tailer.start();
// ... later
tailer.stop();
```

## Error Codes

| Code                              | Description                     |
| --------------------------------- | ------------------------------- |
| `E_OPENCLAW_MISSING_FIELD`        | Required field missing in event |
| `E_OPENCLAW_INVALID_FIELD`        | Invalid field value in event    |
| `E_OPENCLAW_SERIALIZATION_FAILED` | Payload serialization failed    |
| `E_OPENCLAW_SIGNING_FAILED`       | Receipt signing failed          |

## Warning Codes

| Code                                | Description                 |
| ----------------------------------- | --------------------------- |
| `W_OPENCLAW_PAYLOAD_TRUNCATED`      | Payload exceeded size limit |
| `W_OPENCLAW_OPTIONAL_FIELD_MISSING` | Optional field missing      |
| `W_OPENCLAW_UNKNOWN_PROVIDER`       | Unknown tool provider       |

## License

Apache-2.0
