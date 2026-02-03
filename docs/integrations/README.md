# PEAC Integrations

Guides for integrating PEAC with agent frameworks and platforms.

## Available Integrations

| Integration               | Package                  | Status       | Description              |
| ------------------------- | ------------------------ | ------------ | ------------------------ |
| [OpenClaw](./openclaw.md) | `@peac/adapter-openclaw` | Experimental | OpenClaw agent framework |

## Integration Architecture

PEAC integrations follow a layered architecture:

```text
Layer 0: @peac/kernel (types, constants, errors)
Layer 1: @peac/schema (Zod schemas, validation)
Layer 2: @peac/crypto (signing, verification)
Layer 3: @peac/capture-core (runtime-neutral capture)
Layer 4: @peac/adapter-* (platform-specific adapters)  <-- integrations here
```

## Creating a New Integration

To integrate PEAC with a new agent platform:

1. **Create adapter package** at `packages/adapters/{name}/`
2. **Implement mapper** from platform events to `CapturedAction`
3. **Implement hooks** for platform event binding
4. **Add tools** for status, query, verify operations
5. **Add skills** for operator-facing commands
6. **Write tests** covering mapping, capture, and verification
7. **Document** in `docs/integrations/{name}.md`

See the [OpenClaw adapter](../../packages/adapters/openclaw/) as a reference implementation.

## Common Patterns

### Two-Stage Pipeline

All PEAC integrations use a two-stage capture pipeline:

```text
Platform Event -> Capture (sync) -> Spool -> Emit (async) -> Receipt
                  < 10ms            background     signed
```

1. **Capture stage** - Sync, fast, hashes payloads inline
2. **Emit stage** - Async background service, signs and writes receipts

### Deduplication

Integrations use `interaction_id` as the idempotency key:

```text
{platform}/{base64url(run_id)}/{base64url(call_id)}
```

Base64url encoding prevents delimiter collisions in composite IDs.

### Extension Namespacing

Platform-specific metadata uses namespaced extension keys:

```json
{
  "extensions": {
    "org.{platform}/context": {
      "platform_specific": "data"
    }
  }
}
```

## References

- [Interaction Evidence Spec](../specs/INTERACTION-EVIDENCE.md)
- [Adapters Overview](../adapters/README.md)
- [Capture Core Package](../../packages/capture/core/)
