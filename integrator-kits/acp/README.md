# PEAC Integration Kit: Agentic Commerce Protocol (ACP)

Integration guide for recording PEAC evidence from ACP checkout flows.

## What You Need

- `@peac/mappings-acp`: session lifecycle mapping, carrier adapter

## What You Get

- Session lifecycle evidence (access-kind, not payment finality)
- Commerce evidence when explicit payment artifacts are present
- Capability negotiation snapshots for audit
- Intervention evidence for challenge flows

## Quick Start

```bash
npm install @peac/mappings-acp
```

### Session Lifecycle Evidence

ACP session states produce access/session evidence, NOT payment finality:

```typescript
import { fromACPSessionLifecycleEvent } from '@peac/mappings-acp';

const evidence = fromACPSessionLifecycleEvent({
  session_id: 'sess_abc',
  state: 'completed', // "completed" = session completed, NOT payment settled
  resource_uri: 'https://shop.example.com/checkout/abc',
});

// evidence.payment.rail === 'acp'
// evidence.amt === 0 (no payment claim from session state alone)
```

### Payment Observation (with explicit artifact)

Commerce evidence requires an explicit payment artifact with observed payment state:

```typescript
import { fromACPPaymentObservation } from '@peac/mappings-acp';

const evidence = fromACPPaymentObservation(
  {
    session_id: 'sess_abc',
    state: 'completed',
    resource_uri: 'https://shop.example.com/checkout/abc',
  },
  {
    rail: 'stripe',
    reference: 'pi_xyz',
    amount: 1000,
    currency: 'USD',
    observed_payment_state: 'settled', // explicit payment proof
  }
);

// evidence.payment.rail === 'stripe'
// evidence.payment.evidence.commerce_event === 'settlement'
```

### Semantic Boundary

- `fromACPSessionLifecycleEvent()`: session/access evidence only
- `fromACPPaymentObservation()`: commerce evidence only with explicit `observed_payment_state`
- `attempted` and `failed` produce no commerce event even with payment artifact

### Capability Snapshot

```typescript
import { fromACPCapabilitySnapshot } from '@peac/mappings-acp';

const snapshot = fromACPCapabilitySnapshot({
  session_id: 'sess_abc',
  seller_capabilities: { shipping: true },
  buyer_capabilities: { payment_methods: ['card'] },
  negotiated: { shipping: true },
});
```

### Carrier Attach/Extract

```typescript
import { attachCarrierToACPHeaders, extractCarrierFromACPHeaders } from '@peac/mappings-acp';

// Attach PEAC receipt to ACP response
const headers = attachCarrierToACPHeaders({}, carrier);

// Extract from ACP response
const result = extractCarrierFromACPHeaders(responseHeaders);
```

## Reference

- `@peac/mappings-acp`: session lifecycle, carrier adapter
- ACP spec: https://www.agenticcommerce.dev/ (maintained by OpenAI and Stripe)
- ACP version: `2026-01-30` (latest published)
