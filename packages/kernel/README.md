# @peac/kernel

PEAC protocol kernel: normative constants, error codes, registries, and core types. Zero runtime dependencies.

## Installation

```bash
pnpm add @peac/kernel
```

## What It Does

`@peac/kernel` is Layer 0 of the PEAC protocol stack. It provides the type definitions, constants, and error codes that all other packages depend on. It has zero runtime dependencies and no I/O.

## How Do I Use It?

### Import types for evidence carriers

```typescript
import type { PeacEvidenceCarrier, CarrierAdapter, CarrierMeta } from '@peac/kernel';
```

### Use wire format constants

```typescript
import { WIRE_TYPE, HEADERS, ALGORITHMS } from '@peac/kernel';

console.log(WIRE_TYPE); // 'peac-receipt/0.1'
console.log(HEADERS.receipt); // 'PEAC-Receipt'
```

### Access error definitions with recovery hints

```typescript
import { ERRORS } from '@peac/kernel';

const err = ERRORS.E_JWKS_FETCH_FAILED;
console.log(err.code); // 'E_JWKS_FETCH_FAILED'
console.log(err.retryable); // true
console.log(err.next_action); // 'retry_after_delay'
```

### Use registry enums

```typescript
import { PAYMENT_RAILS, CHALLENGE_TYPES, PURPOSE_TOKENS } from '@peac/kernel';
```

## Integrates With

- `@peac/schema` (Layer 1): Zod validators built on kernel types
- `@peac/crypto` (Layer 2): Signing/verification using kernel constants
- `@peac/protocol` (Layer 3): High-level API using kernel error codes
- All `@peac/mappings-*` and `@peac/adapter-*` packages (Layer 4)

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
