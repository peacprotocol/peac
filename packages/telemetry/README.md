# @peac/telemetry

Telemetry interfaces and no-op implementation for PEAC protocol.

## Overview

This package provides the core telemetry interfaces for PEAC. It is designed for:

- **Zero overhead when disabled** - No allocations, no function calls beyond initial check
- **Runtime portability** - Works in Node, edge runtimes, WASM
- **Privacy-first** - Interfaces support privacy modes without requiring implementation

## Installation

```bash
pnpm add @peac/telemetry
```

## Usage

### Basic Setup

```typescript
import { setTelemetryProvider, providerRef, noopProvider } from '@peac/telemetry';

// Enable telemetry with a provider (e.g., from @peac/telemetry-otel)
setTelemetryProvider(myOtelProvider);

// Disable telemetry
setTelemetryProvider(undefined);
```

### Hot Path Pattern

For maximum performance in hot paths (issue/verify):

```typescript
import { providerRef } from '@peac/telemetry';

// Zero overhead when disabled
const p = providerRef.current;
if (p) {
  try {
    p.onReceiptIssued({
      receiptHash: 'sha256:...',
      issuer: 'https://api.example.com',
    });
  } catch {
    // Telemetry MUST NOT break core flow
  }
}
```

### Custom Provider

```typescript
import type { TelemetryProvider } from '@peac/telemetry';

const myProvider: TelemetryProvider = {
  onReceiptIssued(input) {
    console.log('Receipt issued:', input.receiptHash);
  },
  onReceiptVerified(input) {
    console.log('Receipt verified:', input.valid);
  },
  onAccessDecision(input) {
    console.log('Access decision:', input.decision);
  },
};
```

## API

### Provider Registry

- `providerRef` - Singleton ref for hot path access
- `setTelemetryProvider(provider)` - Set or disable the provider
- `getTelemetryProvider()` - Get current provider
- `isTelemetryEnabled()` - Check if telemetry is enabled

### Types

- `TelemetryProvider` - Interface for telemetry providers
- `TelemetryConfig` - Configuration options
- `ReceiptIssuedInput` - Input for receipt issued events
- `ReceiptVerifiedInput` - Input for receipt verified events
- `AccessDecisionInput` - Input for access decision events

### Constants

- `PEAC_ATTRS` - Standard attribute names
- `PEAC_EVENTS` - Event names
- `PEAC_METRICS` - Metric names
- `TRACE_CONTEXT_EXTENSIONS` - W3C trace context extension keys

## Privacy Modes

The `TelemetryConfig` supports three privacy modes:

| Mode       | Behavior                              | Use Case           |
| ---------- | ------------------------------------- | ------------------ |
| `strict`   | Hash all identifiers, minimal data    | Production default |
| `balanced` | Hash identifiers, include rail/amount | Debugging          |
| `custom`   | Allowlist-based filtering             | Specific needs     |

## Related Packages

- `@peac/telemetry-otel` - OpenTelemetry adapter (coming soon)

## License

Apache-2.0

---

Built by [PEAC Protocol](https://peacprotocol.org) contributors.
