# @peac/pay402

Generic HTTP 402 adapter with multi-rail payment negotiation for x402, L402, and other payment protocols.

## Installation

```bash
pnpm add @peac/pay402
```

## What It Does

`@peac/pay402` provides an RFC 9110 compliant HTTP 402 Payment Required handler with pluggable payment rail adapters. It includes a `PaymentNegotiator` that selects the best payment rail from a prioritized list, mock adapters for development and testing, and a handler that generates standards-compliant 402 responses with challenge headers.

## How Do I Use It?

### Create a 402 response with payment negotiation

```typescript
import { Http402Handler, create402Response } from '@peac/pay402';
import type { PaymentChallenge } from '@peac/pay402';

const response = create402Response({
  challenges: [{ rail: 'x402', amount: 100, currency: 'USD', details: { payTo: '0x...' } }],
});
```

### Use the payment negotiator with rail adapters

```typescript
import { PaymentNegotiator, X402MockAdapter } from '@peac/pay402';

const negotiator = new PaymentNegotiator();
negotiator.addAdapter(new X402MockAdapter());

const challenge = await negotiator.negotiate({
  amount: 100,
  currency: 'USD',
  resource: '/api/data',
});
```

### Use rail constants

```typescript
import { RAILS, DEFAULT_RAILS, DEV_RAILS } from '@peac/pay402';

console.log(RAILS.X402); // 'x402'
console.log(DEFAULT_RAILS); // ['x402', 'l402']
console.log(DEV_RAILS); // ['x402', 'tempo', 'l402']
```

## Integrates With

- `@peac/adapter-x402` (Layer 4): Production x402 receipt adapter
- `@peac/middleware-express`: Express middleware for 402 enforcement
- `@peac/protocol` (Layer 3): Receipt issuance for payment evidence

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
