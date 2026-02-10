# OpenClaw Interaction Evidence

Capture OpenClaw tool calls as signed PEAC interaction evidence receipts.

## Install

```bash
pnpm add @peac/adapter-openclaw @peac/capture-core
```

## Run

```bash
pnpm demo
```

## What it does

1. Creates a capture session with in-memory storage
2. Captures three simulated OpenClaw tool call events (web_search, file_read, code_execute)
3. Verifies tamper-evident chain integrity (each entry links to the previous via digest)
4. Emits signed receipts via the background service
5. Prints receipt summaries with interaction IDs and JWS tokens

## Requirements

- Node.js 20+
- pnpm 8+

## Caveats

- The demo signer produces a structurally valid but **not cryptographically signed** JWS.
  For real signing, use an Ed25519 key via `@peac/crypto` or a standard JOSE library.
- In-memory stores are inlined in the demo. In production, use a durable store
  (filesystem, database, etc).

## Using this outside the PEAC monorepo

This example uses `workspace:*` dependencies for monorepo development.
To run it standalone:

```bash
mkdir openclaw-demo && cd openclaw-demo
npm init -y
pnpm add @peac/adapter-openclaw@0.10.9 @peac/capture-core@0.10.9
pnpm add -D @types/node tsx typescript
```

Then copy `demo.ts` and `tsconfig.json` into the directory and run `npx tsx demo.ts`.

## Expected output

```
OpenClaw Interaction Evidence Demo

1. Creating capture session...
   Session ready.

2. Capturing tool calls...
   Captured: web_search -> digest a1b2c3d4...
   Captured: file_read -> digest f7e8d9c0...
   Captured: code_execute -> digest 1234abcd...

3. Verifying chain integrity...
   Chain OK: 3 entries, all linked

4. Emitting signed receipts...
   Emitted 3 receipts

5. Receipt summary:
   - r_<digest>
     interaction_id: openclaw/cnVuX2RlbW8/Y2FsbF8wMDE
     jws: eyJhbGciOiJFZERTQSJ9...

Done. All tool calls captured as verifiable interaction evidence.
```

## Two-stage pipeline

```
Tool Call        Spool             Receipts
(sync hook) --> (append-only)  --> (signed JWS)
< 10ms          events.jsonl       *.peac.json
```

- **Capture stage**: Maps OpenClaw events to CapturedAction, hashes payloads inline
- **Emit stage**: Drains spool, converts to InteractionEvidence, signs with Ed25519

## Next steps

- See [docs/integrations/openclaw.md](../../docs/integrations/openclaw.md) for full configuration
- See [docs/specs/INTERACTION-EVIDENCE.md](../../docs/specs/INTERACTION-EVIDENCE.md) for the schema spec
- See [examples/quickstart/](../quickstart/) for basic receipt issuance and verification
