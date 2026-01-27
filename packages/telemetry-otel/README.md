# @peac/telemetry-otel

OpenTelemetry adapter for PEAC telemetry.

## Overview

This package bridges PEAC telemetry events to OpenTelemetry spans, events, and metrics. It provides:

- **Privacy-preserving** - Hashes identifiers in strict mode
- **Zero overhead when disabled** - Uses the providerRef pattern from @peac/telemetry
- **Baseline metrics** - Works without active spans
- **W3C Trace Context** - Validation and propagation helpers

## Installation

```bash
pnpm add @peac/telemetry-otel @opentelemetry/api
```

Note: `@opentelemetry/api` is a peer dependency. You must install it along with your OTel SDK components.

## Usage

### Basic Setup

```typescript
import { setTelemetryProvider } from '@peac/telemetry';
import { createOtelProvider } from '@peac/telemetry-otel';

// Create and register the OTel provider
const provider = createOtelProvider({
  serviceName: 'my-peac-service',
  privacyMode: 'strict', // Default: hash all identifiers
  hashSalt: process.env.TELEMETRY_SALT, // Required for privacy
});

setTelemetryProvider(provider);
```

### With OpenTelemetry SDK

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { setTelemetryProvider } from '@peac/telemetry';
import { createOtelProvider } from '@peac/telemetry-otel';

// Set up OTel SDK (your existing setup)
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'https://your-otlp-endpoint/v1/traces',
  }),
  // ... other config
});

sdk.start();

// Set up PEAC telemetry
const provider = createOtelProvider({
  serviceName: 'my-api',
  privacyMode: 'strict',
  hashSalt: process.env.TELEMETRY_SALT,
});

setTelemetryProvider(provider);
```

### Privacy Modes

| Mode       | Behavior                              | Use Case           |
| ---------- | ------------------------------------- | ------------------ |
| `strict`   | Hash all identifiers, minimal data    | Production default |
| `balanced` | Hash identifiers, include rail/amount | Debugging          |
| `custom`   | Allowlist-based filtering             | Specific needs     |

### W3C Trace Context

Extract and validate trace context from HTTP headers:

```typescript
import {
  extractTraceparentFromHeaders,
  createTraceContextExtensions,
  validateTraceparent,
} from '@peac/telemetry-otel';

// Extract from incoming request
const traceparent = extractTraceparentFromHeaders(req.headers);

// Validate a traceparent value (returns undefined if invalid)
const valid = validateTraceparent('00-abc123...');

// Create extensions for receipt binding (opt-in for audit)
const extensions = createTraceContextExtensions(req.headers);
```

## API

### Provider

- `createOtelProvider(options)` - Create an OTel-backed telemetry provider

### Trace Context

- `validateTraceparent(value)` - Validate W3C traceparent format
- `parseTraceparent(value)` - Parse a validated traceparent
- `isSampled(traceparent)` - Check if sampled flag is set
- `extractTraceparentFromHeaders(headers)` - Extract from HTTP headers
- `extractTracestateFromHeaders(headers)` - Extract tracestate
- `createTraceContextExtensions(headers)` - Create receipt extension object

### Privacy

- `createPrivacyFilter(config)` - Create a privacy filter function
- `hashIssuer(issuer, salt)` - Hash an issuer URL
- `hashKid(kid, salt)` - Hash a key ID
- `shouldEmitAttribute(key, mode)` - Check if attribute should be emitted

### Metrics

- `createMetrics(meter)` - Create PEAC metrics from an OTel meter
- `recordReceiptIssued(metrics, ...)` - Record receipt issued
- `recordReceiptVerified(metrics, ...)` - Record receipt verified
- `recordAccessDecision(metrics, ...)` - Record access decision

## Related Packages

- `@peac/telemetry` - Core interfaces and no-op provider

## License

Apache-2.0

---

Built by [PEAC Protocol](https://www.peacprotocol.org) contributors.
