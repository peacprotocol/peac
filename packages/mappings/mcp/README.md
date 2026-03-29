# @peac/mappings-mcp

Model Context Protocol (MCP) integration for PEAC: attach and extract signed evidence carriers via MCP `_meta` keys.

## Installation

```bash
pnpm add @peac/mappings-mcp
```

## What It Does

`@peac/mappings-mcp` provides the carrier format for embedding PEAC signed receipts in MCP tool responses. It uses reverse-DNS `_meta` keys (`org.peacprotocol/receipt_ref`, `org.peacprotocol/receipt_jws`) to attach and extract evidence carriers, with budget enforcement utilities for cost-controlled tool calls. Legacy `peac_receipt` format is supported for backward compatibility.

## How Do I Use It?

### Attach a receipt to an MCP tool response

```typescript
import { attachReceiptToMeta } from '@peac/mappings-mcp';
import type { McpResultLike } from '@peac/mappings-mcp';

const result: McpResultLike = { content: [{ type: 'text', text: 'Done' }] };

attachReceiptToMeta(result, carrier, {
  agentId: 'agent:tool-server-1',
  verifiedAt: new Date().toISOString(),
});

// result._meta now contains:
//   "org.peacprotocol/receipt_ref": "sha256:..."
//   "org.peacprotocol/receipt_jws": "eyJ..."
//   "org.peacprotocol/agent_id": "agent:tool-server-1"
```

### Extract a receipt from an MCP tool response

```typescript
import { extractReceiptFromMeta, extractReceiptFromMetaAsync } from '@peac/mappings-mcp';

// Sync: structural validation only
const extracted = extractReceiptFromMeta(result);
if (extracted) {
  console.log(extracted.receipts[0].receipt_ref);
}

// Async: includes receipt_ref consistency verification
const verified = await extractReceiptFromMetaAsync(result);
if (verified && verified.violations.length === 0) {
  console.log(verified.receipts[0].receipt_jws);
}
```

### Use the carrier adapter interface

```typescript
import { McpCarrierAdapter } from '@peac/mappings-mcp';

const adapter = new McpCarrierAdapter();

// Extract from incoming MCP response
const extracted = adapter.extract(mcpResult);

// Attach to outgoing MCP response
adapter.attach(mcpResult, [carrier]);
```

### Enforce budget limits on tool calls

```typescript
import { checkBudget } from '@peac/mappings-mcp';
import type { BudgetConfig } from '@peac/mappings-mcp';

const config: BudgetConfig = {
  maxPerCallMinor: 500n, // $5.00 max per call
  maxDailyMinor: 10000n, // $100.00 max per day
  currency: 'USD',
};

const result = checkBudget(8500n, 1000n, 'USD', config);

if (result.allowed) {
  console.log(`Remaining: ${result.remainingMinor} minor units`);
} else {
  console.log(`Denied: ${result.reason}`);
}
```

### Check for MCP reserved key collisions

```typescript
import { isMcpReservedKey, assertNotMcpReservedKey } from '@peac/mappings-mcp';

isMcpReservedKey('dev.mcp/anything'); // true (reserved)
isMcpReservedKey('org.peacprotocol/receipt_ref'); // false (safe)
```

## Integrates With

- `@peac/kernel` (Layer 0): Evidence carrier types (`PeacEvidenceCarrier`, `CarrierAdapter`)
- `@peac/schema` (Layer 1): Carrier schema validation and `computeReceiptRef()`
- `@peac/mcp-server` (Layer 5): Uses this package for receipt attachment in tool responses

## For Agent Developers

If you are building an MCP tool server that issues or verifies signed receipts:

- Use `attachReceiptToMeta()` to embed evidence in tool call responses
- Use `extractReceiptFromMetaAsync()` to extract and verify receipts from incoming responses
- Use `checkBudget()` for per-call and aggregate cost enforcement
- All `_meta` keys use the `org.peacprotocol/` prefix, which does not collide with MCP reserved prefixes
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
