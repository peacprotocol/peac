# @peac/control

PEAC protocol control engine: constraint enforcement, control block validation, and state management.

## Installation

```bash
pnpm add @peac/control
```

## What It Does

`@peac/control` provides the Control Abstraction Layer (CAL) for the PEAC protocol. It defines vendor-neutral control engine interfaces, constraint types (temporal, usage, budget), enforcement logic, and state management for tracking receipt usage over time. Control engines evaluate whether a receipt's constraints are satisfied before granting access.

## How Do I Use It?

### Enforce a temporal constraint

```typescript
import { enforceTemporalConstraint } from '@peac/control';

const result = enforceTemporalConstraint({
  type: 'temporal',
  valid_from: 1700000000,
  valid_until: 1700086400,
});

console.log(result.allowed); // true or false
console.log(result.remaining?.seconds); // seconds until expiry
```

### Track usage state across multiple interactions

```typescript
import { createControlState, updateStateAfterUse, isStateExpired } from '@peac/control';

const state = createControlState('receipt-123', {
  type: 'usage',
  max_uses: 10,
});

const updated = updateStateAfterUse(state);
console.log(updated.usage_count); // 1
console.log(isStateExpired(updated)); // false
```

### Register a custom control engine adapter

```typescript
import { ControlEngineRegistry } from '@peac/control';
import type { ControlEngineAdapter } from '@peac/control';

const myEngine: ControlEngineAdapter = {
  name: 'my-engine',
  evaluate: async (context) => ({
    result: 'allow',
    evidence: { engine: 'my-engine', checked_at: new Date().toISOString() },
  }),
};

const registry = new ControlEngineRegistry();
registry.register(myEngine);
```

## Integrates With

- `@peac/schema` (Layer 1): Control block and constraint Zod schemas
- `@peac/protocol` (Layer 3): Receipt issuance with embedded control blocks
- `@peac/kernel` (Layer 0): Types and constants used by control logic

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
