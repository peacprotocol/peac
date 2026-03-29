# @peac/mappings-ucp

Universal Commerce Protocol (UCP) order mapping to PEAC signed receipts, webhook signature verification, and dispute evidence generation.

## Installation

```bash
pnpm add @peac/mappings-ucp
```

## What It Does

`@peac/mappings-ucp` maps UCP order data to PEAC receipt claims, verifies UCP webhook signatures using detached JWS (RFC 7797), and generates structured dispute evidence bundles. Order state is kept distinct from payment state: the `payment_state_source` field marks whether payment status was explicitly provided or derived from order fulfillment, so downstream consumers can distinguish observed payment evidence from inferred status.

## How Do I Use It?

### Map a UCP order to receipt claims

```typescript
import { mapUcpOrderToReceipt } from '@peac/mappings-ucp';

const claims = mapUcpOrderToReceipt({
  order: ucpOrder,
  issuer: 'https://merchant.example.com',
  subject: 'agent:shopper-bot-123',
  currency: 'USD',
});

// Sign with @peac/protocol
const receipt = await issue(claims, privateKey, kid);
```

### Verify a UCP webhook signature

```typescript
import { verifyUcpWebhookSignature } from '@peac/mappings-ucp';

const result = await verifyUcpWebhookSignature({
  signature_header: req.headers['request-signature'],
  body_bytes: rawBody,
  profile_url: 'https://business.example.com/.well-known/ucp',
});

if (result.valid) {
  // Signature verified; proceed with order mapping
}
```

### Extract line item summaries and order statistics

```typescript
import { extractLineItemSummary, calculateOrderStats } from '@peac/mappings-ucp';

const summary = extractLineItemSummary(ucpOrder);
const stats = calculateOrderStats(ucpOrder);

console.log(stats.total_items); // number of line items
console.log(stats.fulfilled_items); // items marked fulfilled
```

### Attach and extract evidence carriers on webhook payloads

```typescript
import {
  UcpCarrierAdapter,
  attachCarrierToWebhookPayload,
  extractCarrierFromWebhookPayload,
} from '@peac/mappings-ucp';

// Attach a signed receipt carrier to a UCP webhook payload
attachCarrierToWebhookPayload(webhookPayload, carrier);

// Extract carrier from an incoming webhook payload
const result = extractCarrierFromWebhookPayload(webhookPayload);
if (result) {
  console.log(result.receipts[0].receipt_ref);
}

// Or use the adapter interface
const adapter = new UcpCarrierAdapter();
const extracted = adapter.extract(webhookPayload);
```

## Integrates With

- `@peac/kernel` (Layer 0): Evidence carrier types and constants
- `@peac/schema` (Layer 1): Receipt schemas and carrier validation
- `@peac/protocol` (Layer 3): Sign mapped claims into receipts with `issue()`

## For Agent Developers

If you are building an AI agent that interacts with UCP-based commerce platforms:

- Use `mapUcpOrderToReceipt()` to produce signed evidence of order observations
- Use `verifyUcpWebhookSignature()` to validate incoming webhook authenticity before mapping
- Order status reflects fulfillment state; payment status requires explicit `payment_state` when the upstream source provides it
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
