# @peac/audit

Audit logging, case bundle generation, and commerce evidence bundling for PEAC protocol disputes and observability.

## Installation

```bash
pnpm add @peac/audit
```

## What It Does

`@peac/audit` provides structured audit logging in JSONL format, case bundle generation for dispute resolution, and commerce evidence bundling for multi-protocol payment observations. It includes trace correlation via W3C Trace Context, dispute bundle creation with cryptographic integrity verification, and privacy-safe logging patterns.

## How Do I Use It?

### Create and format audit entries

```typescript
import { createAuditEntry, formatJsonl } from '@peac/audit';

const entry = createAuditEntry({
  event_type: 'receipt_issued',
  actor: { type: 'system', id: 'peac-issuer' },
  resource: { type: 'receipt', id: 'jti:rec_abc123' },
  outcome: { success: true, result: 'issued' },
});

const jsonl = formatJsonl([entry]);
```

### Build a dispute bundle with integrity verification

```typescript
import { createDisputeBundle, verifyBundle } from '@peac/audit';

const bundle = await createDisputeBundle({
  kind: 'dispute',
  receipts: [{ jws: compactJws, ref: receiptRef }],
  jwks: { keys: [publicJwk] },
});

const report = await verifyBundle({ bundle });
console.log(report.summary);
```

### Correlate entries by trace

```typescript
import { correlateByTrace, filterByTimeRange } from '@peac/audit';

const recent = filterByTimeRange(entries, {
  start: '2026-03-01T00:00:00Z',
  end: '2026-03-29T00:00:00Z',
});

const traces = correlateByTrace(recent);
for (const t of traces) {
  console.log(`Trace ${t.trace_id}: ${t.entries.length} events`);
}
```

## Integrates With

- `@peac/kernel` (Layer 0): Error codes and type definitions
- `@peac/schema` (Layer 1): Receipt validation schemas
- `@peac/crypto` (Layer 2): Signature verification for dispute bundles
- `@peac/protocol` (Layer 3): Receipt issuance and verification

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
