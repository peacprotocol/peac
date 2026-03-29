# @peac/rails-card

Card payment rail adapter for PEAC protocol: maps billing events from Flowglad, Stripe Billing, and Lago to signed evidence receipts with billing snapshots.

## Installation

```bash
pnpm add @peac/rails-card
```

## What It Does

`@peac/rails-card` parses card-based billing events from multiple providers and converts them to PEAC `PaymentEvidence` for inclusion in signed interaction receipts. Each receipt captures a billing snapshot (provider, plan, entitlements, capture timestamp) that is evidentiary only; the billing system remains the source of truth for balances. Rail identifiers follow the format `card.<processor>.<provider>`.

## How Do I Use It?

### Parse and normalize a Flowglad charge

```typescript
import { parseFlowgladEvent, toPaymentEvidence } from '@peac/rails-card';

const result = parseFlowgladEvent({
  id: 'evt_123',
  type: 'charge.succeeded',
  data: {
    chargeId: 'ch_abc',
    amount: 2000,
    currency: 'usd',
    customerId: 'cus_456',
    planId: 'pro',
    features: [{ name: 'api_calls', limit: 10000 }],
    livemode: true,
  },
});

if (result.ok) {
  const evidence = toPaymentEvidence(result.value);
  // evidence.rail === 'card.stripe.flowglad'
  // evidence.evidence.billing_snapshot.provider === 'flowglad'
}
```

### Parse a Stripe invoice.paid event

```typescript
import { parseStripeInvoicePaid, toPaymentEvidence } from '@peac/rails-card';

const result = parseStripeInvoicePaid({
  id: 'evt_stripe_123',
  type: 'invoice.paid',
  data: {
    object: {
      id: 'in_abc',
      customer: 'cus_789',
      subscription: 'sub_xyz',
      amount_paid: 4900,
      currency: 'usd',
      lines: { data: [{ price: { product: 'prod_team' } }] },
    },
  },
  livemode: true,
});

if (result.ok) {
  const evidence = toPaymentEvidence(result.value);
  // evidence.rail === 'card.stripe.direct'
}
```

### Parse a Lago invoice event

```typescript
import { parseLagoInvoice, toPaymentEvidence } from '@peac/rails-card';

const result = parseLagoInvoice({
  webhook_type: 'invoice.payment_status_updated',
  invoice: {
    lago_id: 'lago_inv_1',
    external_customer_id: 'cus_ext_1',
    amount_cents: 9900,
    currency: 'eur',
    status: 'succeeded',
    plan_code: 'enterprise',
    charges: [{ billable_metric_code: 'storage_gb', units: 50 }],
  },
});

if (result.ok) {
  const evidence = toPaymentEvidence(result.value);
  // evidence.rail === 'card.lago'
}
```

### Build a rail identifier and validate snapshots

```typescript
import { buildCardRailId, validateBillingSnapshot } from '@peac/rails-card';

const railId = buildCardRailId('flowglad');
// railId === 'card.stripe.flowglad'

const errors = validateBillingSnapshot({
  provider: 'stripe',
  customerExternalId: 'cus_123',
  planSlug: 'pro',
  entitlements: [],
  capturedAt: new Date().toISOString(),
});
// errors === [] (valid)
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants
- `@peac/schema` (Layer 1): `PaymentEvidence` schema validation
- `@peac/protocol` (Layer 3): Receipt issuance using normalized evidence

## For Agent Developers

If you are building an AI agent that processes subscription or billing payments:

- Use provider-specific parsers (`parseFlowgladEvent`, `parseStripeInvoicePaid`, `parseLagoInvoice`) to convert raw events
- Use `toPaymentEvidence` to produce normalized evidence for receipt issuance
- The billing snapshot is evidentiary; it records the billing state at capture time, not current balances
- Parse results use `{ ok, value }` / `{ ok, error, code }` for safe error handling
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
