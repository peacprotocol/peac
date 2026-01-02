# @peac/adapter-x402-fluora

x402+Fluora MCP marketplace adapter for PEAC protocol.

Maps Fluora MCP tool call events to PaymentEvidence using the PEIP-SVC/mcp-call@1 subject profile.

## Installation

```bash
pnpm add @peac/adapter-x402-fluora
```

## Usage

```typescript
import { fromMcpCallEvent, fromWebhookEvent } from '@peac/adapter-x402-fluora';

// Process an MCP call event
const result = fromMcpCallEvent({
  callId: 'call_abc123',
  serverId: 'server_xyz',
  toolName: 'search_web',
  amount: 100, // in minor units (cents)
  currency: 'USD',
  tenantId: 'tenant_123',
  executionMs: 250,
});

if (result.ok) {
  console.log(result.value); // PaymentEvidence
} else {
  console.error(result.error);
}

// Process marketplace event with splits
const marketplaceResult = fromMcpCallEvent({
  callId: 'call_xyz789',
  serverId: 'server_abc',
  toolName: 'image_gen',
  amount: 500,
  currency: 'USD',
  marketplace: {
    sellerId: 'seller_123',
    listingId: 'listing_abc',
    commission: 15, // 15% commission
  },
});

// Result includes aggregator and splits
if (marketplaceResult.ok) {
  console.log(marketplaceResult.value.aggregator); // 'fluora'
  console.log(marketplaceResult.value.splits); // [{ party: 'seller_123', share: 0.85 }]
}
```

## Configuration

```typescript
import { fromMcpCallEvent, type FluoraConfig } from '@peac/adapter-x402-fluora';

const config: FluoraConfig = {
  defaultEnv: 'test',
  allowedServers: ['server_xyz', 'server_abc'],
  allowedTools: ['search_web', 'image_gen'],
};

const result = fromMcpCallEvent(event, config);
```

## Documentation

See [peacprotocol.org](https://peacprotocol.org) for full documentation.

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Originary](https://www.originary.xyz) | [Docs](https://peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac)
