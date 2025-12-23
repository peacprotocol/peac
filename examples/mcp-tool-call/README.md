# MCP Tool Call Example

Demonstrates MCP (Model Context Protocol) tool integration with PEAC receipts.

## What This Shows

1. **Paid MCP Tools**: Server exposes tools that cost money
2. **Receipt Attachment**: Receipts attached to tool responses
3. **Receipt Verification**: Client extracts and verifies receipts

## Running the Demo

```bash
pnpm demo
```

## Key Concepts

### Receipt Attachment

Receipts are attached to MCP tool responses:

```typescript
import { createPaidToolResponse, extractReceipt } from '@peac/mappings-mcp';

// Server attaches receipt
const response = createPaidToolResponse(toolName, result, receiptJWS, {
  cost_cents: 5,
  currency: 'USD',
});

// Client extracts receipt
const receipt = extractReceipt(response);
```

### Verification Flow

```typescript
import { verify } from '@peac/crypto';
import { hasReceipt, extractReceipt } from '@peac/mappings-mcp';

if (hasReceipt(response)) {
  const receipt = extractReceipt(response);
  const { valid, payload } = await verify(receipt, publicKey);
  console.log(`Paid ${payload.amt} ${payload.cur}`);
}
```

## Files

- `demo.ts` - Main demonstration script
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
