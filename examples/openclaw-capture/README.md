# OpenClaw Activity Records

Capture OpenClaw tool calls as offline-verifiable activity records with durable file-based storage and real signing.

## Run

```bash
# From monorepo root
pnpm -C examples/openclaw-capture demo
```

## What it does

1. Generates a signing key (to a temp directory)
2. Activates the evidence export plugin with durable file-based storage
3. Captures 3 simulated tool call events (web_search, file_read, code_execute)
4. Exports an evidence bundle (manifest.json + signed receipts)
5. Verifies the bundle offline

## Requirements

- Node.js 22+
- pnpm 8+
- Run from the monorepo root (uses `workspace:*` dependencies)

## Expected output

```
1. Generating signing key...
   kid: <key-id>

2. Activating plugin...
   Plugin active.

3. Capturing tool calls...
   web_search: captured
   file_read: captured
   code_execute: captured

4. Flushing receipts...
   Receipts signed and written.

5. Exporting evidence bundle...
   Exported 3 receipts.

6. Verifying bundle...

verification successful -- 3 receipts in evidence bundle
```

## License

Apache-2.0
