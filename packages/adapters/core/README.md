# @peac/adapter-core

Shared utilities for PEAC payment rail adapters.

## Installation

```bash
pnpm add @peac/adapter-core
```

## Usage

### Result Type

All adapter functions use the Result type for explicit error handling:

```typescript
import { ok, err, isOk, type Result } from '@peac/adapter-core';

function parseEvent(input: unknown): Result<Event, AdapterError> {
  if (!input) {
    return adapterErr('input is required', 'missing_required_field');
  }
  return ok({ ...parsed });
}

// Handle result
const result = parseEvent(data);
if (isOk(result)) {
  console.log(result.value);
} else {
  console.error(result.error.message);
}
```

### Validators

Common validation functions for adapter inputs:

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

### Available Validators

| Validator                             | Description                 |
| ------------------------------------- | --------------------------- |
| `requireString(value, field)`         | Non-empty string required   |
| `optionalString(value, field)`        | String or undefined         |
| `requireNumber(value, field)`         | Finite number required      |
| `requireAmount(value)`                | Non-negative safe integer   |
| `requireCurrency(value)`              | ISO 4217 currency code      |
| `optionalNetwork(value)`              | Network identifier (CAIP-2) |
| `requireObject(value, field)`         | Non-null object             |
| `optionalTimestamp(value)`            | ISO 8601 or Unix seconds    |
| `optionalBoolean(value, field)`       | Boolean or undefined        |
| `requireEnum(value, allowed, field)`  | Value from allowed list     |
| `optionalEnum(value, allowed, field)` | Enum or undefined           |

### JSON Types

Re-exported from `@peac/kernel` for convenience:

```typescript
import type { JsonObject, JsonValue } from '@peac/adapter-core';

interface PaymentEvidence {
  rail: string;
  evidence: JsonObject; // JSON-safe, no unknown
}
```

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
