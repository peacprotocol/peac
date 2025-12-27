# @peac/rails-card

Card payment rail adapter for PEAC Protocol.

Maps card-based billing events from Flowglad, Stripe Billing, and Lago into PEAC PaymentEvidence with billing snapshot.

## Installation

```bash
npm install @peac/rails-card
```

## Usage

```typescript
import {
  parseFlowgladEvent,
  parseStripeInvoicePaid,
  parseLagoInvoice,
  toPaymentEvidence,
} from '@peac/rails-card';

// Parse provider-specific event
const result = parseFlowgladEvent(webhookEvent);
if (result.ok) {
  // Convert to PEAC PaymentEvidence
  const evidence = toPaymentEvidence(result.value);
  // evidence.rail = 'card.stripe.flowglad'
  // evidence.evidence.billing_snapshot contains entitlements
}
```

## Rail ID Format

Card rail IDs follow the format: `card.<processor>.<provider>`

- `card.stripe.flowglad` - Flowglad (uses Stripe as processor)
- `card.stripe.direct` - Direct Stripe Billing
- `card.lago` - Lago billing

## Billing Snapshot

The `billing_snapshot` in PaymentEvidence contains:

- `provider` - Billing provider (flowglad, stripe, lago)
- `customer_external_id` - Customer ID in your system
- `plan_slug` - Plan or product identifier
- `entitlements` - List of features/limits at capture time
- `captured_at` - ISO 8601 timestamp
- `subscription_id` - Optional subscription ID
- `invoice_id` - Optional invoice ID

The billing snapshot is evidentiary only. The billing system remains the source of truth for balances.

## License

Apache-2.0

---

Part of [PEAC Protocol](https://peacprotocol.org) - Policy, Economics, Attribution, Compliance for AI commerce.
