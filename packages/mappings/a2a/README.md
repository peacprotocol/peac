# @peac/mappings-a2a

Agent-to-Agent Protocol (A2A) integration for PEAC: maps A2A agent cards, task states, and metadata to PEAC evidence carriers.

## Installation

```bash
pnpm add @peac/mappings-a2a
```

## What It Does

`@peac/mappings-a2a` bridges PEAC signed interaction receipts and the Agent-to-Agent Protocol (A2A). It normalizes A2A v0.3.0 and v1.0.0 structures into a consistent shape, attaches and extracts PEAC evidence carriers from A2A metadata, and discovers PEAC capabilities advertised by remote agents. All carrier operations enforce transport constraints (64 KB embed limit for A2A).

## How Do I Use It?

### Normalize an A2A Agent Card

Accept either v0.3.0 or v1.0.0 Agent Cards and get a consistent interface:

```typescript
import { normalizeAgentCard } from '@peac/mappings-a2a';

const card = {
  name: 'billing-agent',
  supportedInterfaces: [
    { url: 'https://billing.example.com', protocolBinding: 'http+json', protocolVersion: '1.0.0' },
  ],
};
const normalized = normalizeAgentCard(card);

if (normalized) {
  console.log(normalized.version); // '1.0.0'
  console.log(normalized.url); // 'https://billing.example.com'
}
```

### Normalize a task state across versions

```typescript
import { normalizeTaskState } from '@peac/mappings-a2a';

// v0.3.0 value normalized to v1.0.0 canonical form
console.log(normalizeTaskState('working')); // 'TASK_STATE_WORKING'

// v1.0.0 values pass through unchanged
console.log(normalizeTaskState('TASK_STATE_COMPLETED')); // 'TASK_STATE_COMPLETED'
```

### Attach a receipt to A2A TaskStatus metadata

```typescript
import { attachReceiptToTaskStatus } from '@peac/mappings-a2a';
import type { PeacEvidenceCarrier } from '@peac/kernel';

const carrier: PeacEvidenceCarrier = {
  receipt_ref: 'sha256-abc123...',
  receipt_jws: 'eyJ...',
};

const status = { state: 'TASK_STATE_COMPLETED', metadata: {} };
attachReceiptToTaskStatus(status, [carrier]);
// status.metadata now contains the PEAC extension payload
```

### Extract receipts from A2A metadata

```typescript
import { extractReceiptFromMetadata } from '@peac/mappings-a2a';

const result = extractReceiptFromMetadata(taskStatus.metadata);
if (result) {
  console.log(result.receipts.length); // number of valid carriers
  console.log(result.meta.transport); // 'a2a'
}
```

### Use the carrier adapter

```typescript
import { A2ACarrierAdapter, createA2ACarrierMeta } from '@peac/mappings-a2a';

const adapter = new A2ACarrierAdapter();
const meta = createA2ACarrierMeta();

// Extract from incoming TaskStatus
const extracted = adapter.extract(incomingStatus);

// Attach to outgoing TaskStatus
const outgoing = adapter.attach(responseStatus, carriers, meta);
```

### Discover PEAC capabilities from a remote agent

```typescript
import { discoverPeacCapabilities } from '@peac/mappings-a2a';

const result = await discoverPeacCapabilities('https://agent.example.com');
if (result) {
  console.log(result.source); // 'agent_card' | 'well_known' | 'header_probe'
  console.log(result.kinds); // supported receipt kinds
  console.log(result.carrier_formats); // supported carrier formats
}
```

## Integrates With

- `@peac/kernel` (Layer 0): Evidence carrier types and constants
- `@peac/schema` (Layer 1): Carrier schema validation and receipt ref consistency
- `@peac/protocol` (Layer 3): Receipt issuance and verification
- `@peac/mcp-server` (Layer 5): MCP tool server with A2A interoperability

## For Agent Developers

If you are building an AI agent that communicates via A2A and needs signed interaction receipts:

- Use `normalizeAgentCard()` and `normalizeTaskState()` to handle both A2A v0.3.0 and v1.0.0 inputs
- Use `attachReceiptToTaskStatus()` to embed evidence in outgoing A2A messages
- Use `extractReceiptFromMetadata()` to retrieve evidence from incoming A2A messages
- Use `A2ACarrierAdapter` for a transport-agnostic carrier interface
- Use `discoverPeacCapabilities()` to check whether a remote agent supports PEAC before sending receipts

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
