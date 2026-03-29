# @peac/adapter-openclaw

OpenClaw adapter for capturing agent tool calls as signed, offline-verifiable PEAC interaction records.

## Installation

```bash
pnpm add @peac/adapter-openclaw
```

## What It Does

`@peac/adapter-openclaw` captures every tool call an OpenClaw agent makes and produces tamper-evident signed receipts. It uses a two-stage pipeline: a sync capture stage (under 10ms) appends hashed evidence to an append-only spool, and an async background emitter drains the spool, signs each entry, and writes individual receipt files. All inputs and outputs are SHA-256 hashed by default; plaintext is only captured for explicitly allowlisted tools.

## How Do I Use It?

### Quick start with activate()

```typescript
import { activate, generateSigningKey } from '@peac/adapter-openclaw';

// Generate a signing key (one-time setup)
const key = await generateSigningKey({ outputDir: '.peac' });

// Activate the plugin
const plugin = await activate({
  config: {
    signing: {
      key_ref: `file:${key.keyPath}`,
      issuer: 'https://my-org.example.com',
    },
  },
});

plugin.instance.start();
// Records are now captured automatically via hooks.
```

### Map individual tool call events

```typescript
import { mapToolCallEvent } from '@peac/adapter-openclaw';

const result = mapToolCallEvent(event);
if (result.ok) {
  console.log('Captured action:', result.action);
  console.log('Warnings:', result.warnings);
}
```

### Use lower-level components directly

```typescript
import {
  createHookHandler,
  createReceiptEmitter,
  createBackgroundService,
  createSessionHistoryTailer,
} from '@peac/adapter-openclaw';
```

## Integrates With

- `@peac/adapter-core` (Layer 4): Shared Result types
- `@peac/capture-core`: Capture session, spool store, and deduplication
- `@peac/capture-node`: File-system spool store and deduplication index
- `@peac/crypto` (Layer 2): Ed25519 signing and SHA-256 hashing
- `@peac/kernel` (Layer 0): Wire constants and types
- `@peac/schema` (Layer 1): Receipt claim schemas

## For Agent Developers

If you are building an AI agent on OpenClaw that needs verifiable activity records:

- Use `activate()` for the simplest setup; it wires all components from a single config object
- Use `generateSigningKey()` or the `peac-keygen` CLI to create a signing keypair
- Use `env:` key references in CI/CD and `file:` references for local development
- The plugin exposes tools (`peac_receipts.status`, `peac_receipts.verify`, `peac_receipts.query`, `peac_receipts.export_bundle`) for the agent to inspect its own receipt state
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
