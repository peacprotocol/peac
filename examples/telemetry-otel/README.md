# OpenTelemetry Integration Example

Demonstrates PEAC receipt telemetry with OpenTelemetry (OTel).

## What This Shows

- Setting up OTel tracing with PEAC telemetry
- Privacy modes (strict vs balanced)
- Automatic span events for receipt operations
- How to export traces to observability platforms

## Quick Start

```bash
# From the example directory
pnpm install
pnpm build
pnpm start
```

## Output

The demo issues receipts with different privacy modes:

1. **Strict mode**: Hashes all identifiers (issuer, kid)
2. **Balanced mode**: Includes payment details (rail, amounts)

Both modes emit span events visible in OTel traces.

## Production Usage

Replace the console exporter with a real backend:

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const exporter = new OTLPTraceExporter({
  url: 'https://your-otel-collector.example.com/v1/traces',
});
```

Compatible with: Jaeger, Honeycomb, Grafana Tempo, Datadog, etc.

## Privacy Modes

| Mode       | Identifiers     | Payment Details         |
| ---------- | --------------- | ----------------------- |
| `strict`   | SHA-256 hashed  | Omitted                 |
| `balanced` | SHA-256 hashed  | Included (rail, amount) |
| `custom`   | Allowlist-based | Allowlist-based         |

## Related

- [@peac/telemetry](../../packages/telemetry) - Core interfaces
- [@peac/telemetry-otel](../../packages/telemetry-otel) - OTel adapter
