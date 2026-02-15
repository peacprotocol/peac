# @peac/adapter-openclaw

Offline-verifiable activity records for OpenClaw sessions.

## Quick Start

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

> Never log or print the contents of `key_ref`. Use `env:` key references in CI, `file:` for local development. Signing key files are written with 0600 permissions (owner read/write only).

## What It Records

Every tool call your agent makes is captured as a tamper-evident record:

- **Tool name, timing, status** -- what ran, when, whether it succeeded
- **Input/output digests** -- SHA-256 hashes by default (payloads are never stored in plaintext unless you explicitly allowlist a tool)
- **Chain linkage** -- each record links to the previous one, so gaps or reordering are detectable

Records are signed with your key and written to disk as individual `.peac.json` files.

## Commands

### Key Generation

```bash
npx peac-keygen --output-dir .peac
```

Generates a signing keypair. The private key is written with 0600 permissions. Print the `kid` and public key for registration with your infrastructure.

### Plugin Tools

The plugin exposes 4 tools to the agent:

| Tool                          | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `peac_receipts.status`        | Spool size, last receipt time, configuration summary              |
| `peac_receipts.export_bundle` | Export receipts as an evidence bundle (manifest.json + receipts/) |
| `peac_receipts.verify`        | Verify a receipt or bundle offline                                |
| `peac_receipts.query`         | Query receipts by workflow ID, tool name, or time range           |

## Configuration

### `activate()` Options

```typescript
const plugin = await activate({
  config: {
    signing: {
      key_ref: 'env:PEAC_SIGNING_KEY', // or 'file:/path/to/key.jwk'
      issuer: 'https://my-org.example.com',
      audience: 'https://api.example.com', // optional
    },
    output_dir: '.peac/receipts', // optional (default: {dataDir}/receipts/)
    background: {
      drain_interval_ms: 1000, // optional (default: 1000)
      batch_size: 100, // optional (default: 100)
    },
  },
  dataDir: '.peac', // optional (default: ~/.openclaw/peac/)
  spoolOptions: {
    maxEntries: 100_000, // optional (default: 100,000)
    maxFileBytes: 104_857_600, // optional (default: 100MB)
    autoCommitIntervalMs: 5000, // optional (default: 5000, 0 to disable)
  },
});
```

### Key Reference Schemes

| Scheme  | Format                  | Use Case                                       |
| ------- | ----------------------- | ---------------------------------------------- |
| `env:`  | `env:PEAC_SIGNING_KEY`  | CI/CD, containers (key in env var as JWK JSON) |
| `file:` | `file:/path/to/key.jwk` | Local development (key file on disk)           |

## Compatibility

| Requirement   | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| Node.js       | >= 22.0.0                                                  |
| Module format | ESM (`.mjs`) and CJS (`.cjs`) dual-published               |
| Runtime       | Node.js only (uses `fs`, `path`, `crypto`)                 |
| Workers/Edge  | Not supported (requires file system access)                |
| OpenClaw      | v2026.2.7+ (before_tool_call or tool_result_persist hooks) |

## Architecture

### Two-Stage Pipeline

```text
Tool Call        Spool             Receipts
(sync hook) --> (append-only)  --> (signed receipt)
< 10ms          spool.jsonl        *.peac.json
```

1. **Capture stage** (sync, < 10ms target): Map OpenClaw event to a captured action, hash payloads inline, write to tamper-evident spool
2. **Emit stage** (async background): Drain spool periodically, convert to interaction evidence, sign with configured key, write receipt to output directory

### OpenClaw-to-Receipt Mapping

| OpenClaw Concept      | Receipt Field               |
| --------------------- | --------------------------- |
| Session key           | `workflow_id` (correlation) |
| Run ID + tool_call_id | `interaction_id` (dedupe)   |
| Tool call params      | `input.digest`              |
| Tool call result      | `output.digest`             |
| Tool name             | `tool.name`                 |
| Sandbox mode          | `policy.sandbox_enabled`    |
| Elevated flag         | `policy.elevated`           |

## API Reference

### High-Level (Recommended)

```typescript
import { activate, generateSigningKey } from '@peac/adapter-openclaw';

// activate() wires all components from config
const plugin = await activate(options);
plugin.instance.start();

// Capture events via the hook handler
await plugin.hookHandler.afterToolCall(event);

// Flush pending records into signed receipts
await plugin.flush();

// Clean shutdown (flushes + closes stores)
await plugin.shutdown();
```

### Lower-Level (Advanced)

For custom wiring or when you need direct access to individual components:

```typescript
import {
  createHookHandler,
  createReceiptEmitter,
  createBackgroundService,
  mapToolCallEvent,
  createSessionHistoryTailer,
} from '@peac/adapter-openclaw';
```

See the source for `createHookHandler()`, `createReceiptEmitter()`, `createBackgroundService()`, and `createSessionHistoryTailer()`.

## Security

- **Privacy by default**: All inputs and outputs are hashed (SHA-256). Plaintext is only captured for explicitly allowlisted tools.
- **Key protection**: Signing key files are written with 0600 permissions. Use `env:` references in CI to avoid keys on disk.
- **Tamper evidence**: Each spool entry links to the previous via digest. Gaps or reordering are detectable.
- **No secret logging**: The adapter never logs private key material. Only the key ID (`kid`) and public key component appear in logs.

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
