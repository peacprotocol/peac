# @peac/adapter-core

Shared Result types, validators, and payment proof interfaces for PEAC adapters.

## Installation

```bash
pnpm add @peac/adapter-core
```

## What It Does

`@peac/adapter-core` provides the foundational utilities that all PEAC adapters build on. It enforces a "never throws" convention where all adapter functions return explicit `Result<T>` values instead of throwing exceptions. It also provides input validators for common fields (amounts, currencies, networks, timestamps) and defines the `PaymentProofAdapter` interface that payment-focused adapters implement.

## How Do I Use It?

### Use the Result type for explicit error handling

```typescript
import { ok, adapterErr, isOk, type Result, type AdapterError } from '@peac/adapter-core';

function parseEvent(input: unknown): Result<{ id: string }, AdapterError> {
  if (!input) {
    return adapterErr('input is required', 'missing_required_field');
  }
  return ok({ id: 'parsed-event' });
}

const result = parseEvent(data);
if (isOk(result)) {
  console.log(result.value.id);
} else {
  console.error(result.error.code, result.error.message);
}
```

### Validate adapter inputs

```typescript
import { requireString, requireAmount, requireCurrency, requireObject } from '@peac/adapter-core';

function parseWebhook(event: unknown) {
  const objResult = requireObject(event);
  if (!objResult.ok) return objResult;

  const amountResult = requireAmount(objResult.value.amount);
  if (!amountResult.ok) return amountResult;

  const currencyResult = requireCurrency(objResult.value.currency);
  if (!currencyResult.ok) return currencyResult;

  return ok({ amount: amountResult.value, currency: currencyResult.value });
}
```

### Use JSON types for evidence structures

```typescript
import type { JsonObject, JsonValue } from '@peac/adapter-core';

interface PaymentEvidence {
  rail: string;
  evidence: JsonObject;
}
```

## Integrates With

- `@peac/kernel` (Layer 0): JSON types re-exported for convenience
- `@peac/adapter-x402` (Layer 4): Uses Result types and validators
- `@peac/adapter-openclaw` (Layer 4): Uses Result types
- All `@peac/adapter-*` and `@peac/mappings-*` packages

## For Agent Developers

If you are building a custom PEAC adapter for a new payment rail or protocol:

- Import `Result`, `ok`, `err`, and `adapterErr` to follow the "never throws" convention
- Use the provided validators (`requireAmount`, `requireCurrency`, `requireString`) for input parsing
- Implement the `PaymentProofAdapter` interface for payment-focused adapters
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
