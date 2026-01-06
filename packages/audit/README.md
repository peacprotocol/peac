# @peac/audit

Audit logging and case bundle generation for PEAC protocol (v0.9.27+).

## Features

- **JSONL Audit Logs** - Normative format for PEAC audit trails
- **Case Bundles** - Collect related entries for dispute resolution
- **Trace Correlation** - Link events via W3C Trace Context
- **Privacy-Safe** - Designed for privacy-preserving logging

## Installation

```bash
pnpm add @peac/audit
```

## Usage

### Creating Audit Entries

```typescript
import { createAuditEntry, formatJsonl } from '@peac/audit';

// Create an audit entry
const entry = createAuditEntry({
  event_type: 'receipt_issued',
  actor: { type: 'system', id: 'peac-issuer' },
  resource: { type: 'receipt', id: 'jti:rec_abc123' },
  outcome: { success: true, result: 'issued' },
  trace: {
    trace_id: 'abc123def456789012345678901234ab',
    span_id: '1234567890123456',
  },
});

// Format to JSONL for logging
const line = formatJsonl([entry], { trailingNewline: true });
```

### Parsing Audit Logs

```typescript
import { parseJsonl } from '@peac/audit';

const logContent = `
{"version":"peac.audit/0.9","id":"01ARZ...","event_type":"receipt_issued",...}
{"version":"peac.audit/0.9","id":"01ARZ...","event_type":"access_decision",...}
`;

const result = parseJsonl(logContent, { skipInvalid: true });
console.log(`Parsed ${result.successCount}/${result.totalLines} entries`);
```

### Creating Case Bundles for Disputes

```typescript
import { createCaseBundle, filterByDispute } from '@peac/audit';

// Filter entries related to a dispute
const disputeEntries = filterByDispute(allEntries, '01ARZ3NDEKTSV4RRFFQ69G5FAV');

// Create a case bundle
const bundle = createCaseBundle({
  dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  generated_by: 'https://platform.example.com/disputes',
  entries: disputeEntries,
});

console.log(`Bundle contains ${bundle.summary.entry_count} entries`);
console.log(`Time span: ${bundle.summary.first_event} to ${bundle.summary.last_event}`);
```

### Trace Correlation

```typescript
import { correlateByTrace } from '@peac/audit';

const correlations = correlateByTrace(entries);

for (const trace of correlations) {
  console.log(`Trace ${trace.trace_id}:`);
  console.log(`  - ${trace.entries.length} events`);
  console.log(`  - ${trace.span_ids.length} spans`);
  console.log(`  - Duration: ${trace.duration_ms}ms`);
}
```

## Audit Entry Format

Each audit entry follows this structure:

```typescript
interface AuditEntry {
  version: 'peac.audit/0.9';
  id: string; // ULID format
  event_type: AuditEventType;
  timestamp: string; // ISO 8601
  severity: 'info' | 'warn' | 'error' | 'critical';
  trace?: TraceContext;
  actor: AuditActor;
  resource: AuditResource;
  outcome: AuditOutcome;
  context?: Record<string, unknown>;
  dispute_ref?: string; // ULID if related to dispute
}
```

## Event Types

- `receipt_issued` - Receipt was created
- `receipt_verified` - Receipt was verified
- `receipt_denied` - Receipt verification failed
- `access_decision` - Access control decision made
- `dispute_filed` - Dispute was filed
- `dispute_acknowledged` - Dispute acknowledged
- `dispute_resolved` - Dispute resolved
- `dispute_rejected` - Dispute rejected
- `dispute_appealed` - Dispute appealed
- `dispute_final` - Final dispute decision
- `attribution_created` - Attribution created
- `attribution_verified` - Attribution verified
- `identity_verified` - Identity verified
- `identity_rejected` - Identity rejected
- `policy_evaluated` - Policy evaluated

## License

Apache-2.0

---

Part of the [PEAC Protocol](https://github.com/peacprotocol/peac).
