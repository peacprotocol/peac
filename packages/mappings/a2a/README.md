# @peac/mappings-a2a

Agent-to-Agent Protocol (A2A) integration for PEAC: maps A2A agent cards, task states, and metadata to PEAC evidence carriers.

## Installation

```bash
pnpm add @peac/mappings-a2a
```

## What It Does

`@peac/mappings-a2a` bridges PEAC signed interaction receipts and the Agent-to-Agent Protocol (A2A). It validates A2A v1.0.0 Agent Card structures, attaches and extracts PEAC evidence carriers from A2A metadata, and discovers PEAC capabilities advertised by remote agents. All carrier operations enforce transport constraints (64 KB embed limit for A2A).

A2A v0.3.0 compatibility (dual-version Agent Cards, top-level `url`, kebab-case TaskState normalization, `/.well-known/agent.json` legacy discovery path) was deprecated in v0.12.3 and removed in v0.13.0 (DD-186). This package accepts A2A v1.0.0 shapes only; see [`docs/MIGRATION_CURRENT.md`](../../../docs/MIGRATION_CURRENT.md) for the migration guide.

## How Do I Use It?

### Validate an A2A v1.0.0 Agent Card

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
  console.log(normalized.url); // 'https://billing.example.com'
}
// Cards without a valid supportedInterfaces[0].url (including legacy
// v0.3.0 cards that used top-level `url`) return null.
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

- Use `normalizeAgentCard()` to validate incoming A2A v1.0.0 Agent Cards (cards without a valid `supportedInterfaces[0].url` return `null`)
- Use `attachReceiptToTaskStatus()` to embed evidence in outgoing A2A messages
- Use `extractReceiptFromMetadata()` to retrieve evidence from incoming A2A messages
- Use `A2ACarrierAdapter` for a transport-agnostic carrier interface
- Use `discoverPeacCapabilities()` to check whether a remote agent supports PEAC before sending receipts

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
