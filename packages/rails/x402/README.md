# @peac/rails-x402

x402 payment rail adapter for PEAC protocol: normalizes x402 invoices, settlements, and webhook events to signed evidence receipts with v1/v2 dialect auto-detection.

## Installation

```bash
pnpm add @peac/rails-x402
```

## What It Does

`@peac/rails-x402` maps x402 payment protocol objects to PEAC `PaymentEvidence` for inclusion in signed interaction receipts. It supports both v1 (legacy `X-PAYMENT-*` headers) and v2 (`Payment-*` headers) dialects with automatic detection. Network identifiers use CAIP-2 format, and the adapter includes header detection utilities for HTTP payment flows.

## How Do I Use It?

### Normalize an x402 invoice

```typescript
import { fromInvoice } from '@peac/rails-x402';

const evidence = fromInvoice({
  id: 'inv_abc123',
  amount: 1000000,
  currency: 'USD',
  network: 'eip155:8453',
  payTo: { mode: 'direct' },
});
// evidence.rail === 'x402'
// evidence.network === 'eip155:8453'
// evidence.routing === 'direct'
```

### Normalize a settlement

```typescript
import { fromSettlement } from '@peac/rails-x402';

const evidence = fromSettlement({
  id: 'stl_xyz',
  invoice_id: 'inv_abc123',
  amount: 1000000,
  currency: 'USD',
  network: 'eip155:8453',
  settled_at: '2026-03-15T12:00:00Z',
});
// evidence.reference === 'inv_abc123'
```

### Detect x402 payment headers

```typescript
import { detectPaymentRequired, extractPaymentReference } from '@peac/rails-x402';

// Works with native Headers, Express req.headers, or plain objects
const headers = { 'payment-required': 'base64-encoded-invoice' };

if (detectPaymentRequired(headers)) {
  const reference = extractPaymentReference(headers);
  // reference === 'base64-encoded-invoice'
}
```

### Detect dialect from response headers

```typescript
import { detectDialect, getHeaders } from '@peac/rails-x402';

const dialect = detectDialect({ 'payment-required': '...' });
// dialect === 'v2'

const headerNames = getHeaders(dialect);
// headerNames.paymentRequired === 'Payment-Required'
```

### Handle webhook events

```typescript
import { fromWebhookEvent } from '@peac/rails-x402';

const evidence = fromWebhookEvent(
  {
    type: 'invoice.paid',
    data: {
      object: {
        id: 'inv_abc',
        amount: 500000,
        currency: 'USD',
        network: 'eip155:8453',
      },
    },
  },
  'live',
  { 'payment-required': '...' }
);
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants
- `@peac/schema` (Layer 1): `PaymentEvidence` and `PaymentSplit` schema validation
- `@peac/protocol` (Layer 3): Receipt issuance using normalized evidence
- `@peac/adapter-x402` (Layer 4): Higher-level x402 receipt verification and extraction
- `@peac/rails-stripe` (Layer 4): Stripe crypto payment intents settled via x402

## For Agent Developers

If you are building an AI agent that handles x402 machine-to-machine payments:

- Use `fromInvoice` and `fromSettlement` to capture x402 payment evidence
- Use `detectPaymentRequired` to check HTTP responses for x402 payment challenges
- The adapter auto-detects v1/v2 dialect; pass `'v1'` or `'v2'` explicitly to override
- Network identifiers use CAIP-2 format (e.g., `eip155:8453` for Base)
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
