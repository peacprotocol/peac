# @peac/rails-stripe

Stripe payment rail adapter for PEAC protocol: normalizes checkout sessions, payment intents, crypto intents, webhooks, and SPT delegation lifecycle events to signed evidence receipts.

## Installation

```bash
pnpm add @peac/rails-stripe
```

## What It Does

`@peac/rails-stripe` maps Stripe payment objects to PEAC `PaymentEvidence` for inclusion in signed interaction receipts. It supports fiat payments (checkout sessions, payment intents), crypto payments (x402 machine-to-machine flows), webhook events, and Shared Payment Token (SPT) delegation lifecycle evidence. SPT functions produce delegation evidence only; only `fromStripePaymentIntentObservation` may emit commerce events.

## How Do I Use It?

### Normalize a checkout session

```typescript
import { fromCheckoutSession } from '@peac/rails-stripe';

const evidence = fromCheckoutSession({
  id: 'cs_live_abc123',
  amount_total: 2000,
  currency: 'usd',
  payment_intent: 'pi_xyz',
  customer: 'cus_456',
});
// evidence.rail === 'stripe'
// evidence.amount === 2000
// evidence.currency === 'USD'
```

### Normalize a payment intent

```typescript
import { fromPaymentIntent } from '@peac/rails-stripe';

const evidence = fromPaymentIntent({
  id: 'pi_live_abc123',
  amount: 5000,
  currency: 'eur',
});
// evidence.rail === 'stripe'
// evidence.reference === 'pi_live_abc123'
```

### Normalize a crypto payment intent

```typescript
import { fromCryptoPaymentIntent } from '@peac/rails-stripe';

const evidence = fromCryptoPaymentIntent(
  {
    id: 'pi_crypto_abc',
    amount: 1000000,
    currency: 'usd',
    asset: 'usdc',
    network: 'eip155:8453',
    tx_hash: '0xabc...',
    recipient: '0xdef...',
  },
  { env: 'live', metadataPolicy: 'omit' }
);
// evidence.asset === 'USDC'
// evidence.network === 'eip155:8453'
```

### Handle a Stripe webhook event

```typescript
import { fromWebhookEvent } from '@peac/rails-stripe';

const evidence = fromWebhookEvent({
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_live_abc',
      amount_total: 3000,
      currency: 'usd',
    },
  },
});
```

### SPT delegation lifecycle

```typescript
import {
  fromSPTGrant,
  fromSPTUse,
  fromSPTDeactivate,
  fromStripePaymentIntentObservation,
} from '@peac/rails-stripe';

// Grant: delegation evidence only, no commerce event
const grant = fromSPTGrant({
  id: 'spt_grant_1',
  token_id: 'spt_tok_abc',
  seller_scope: { merchant_id: 'merch_123' },
  amount_limit: '10000',
  currency: 'usd',
});

// Use: delegation evidence only, no commerce event
const use = fromSPTUse({
  id: 'spt_use_1',
  token_id: 'spt_tok_abc',
  amount: '5000',
  currency: 'usd',
  merchant_id: 'merch_123',
});

// Deactivate: lifecycle evidence, no commerce event
const deactivate = fromSPTDeactivate({
  id: 'spt_deact_1',
  token_id: 'spt_tok_abc',
  reason: 'expired',
});

// PaymentIntent observation: ONLY source of commerce events
const piObservation = fromStripePaymentIntentObservation({
  payment_intent_id: 'pi_xyz',
  status: 'succeeded',
  amount: '5000',
  currency: 'usd',
});
// piObservation.evidence.commerce_event === 'settlement'
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants
- `@peac/schema` (Layer 1): `PaymentEvidence` schema validation
- `@peac/protocol` (Layer 3): Receipt issuance using normalized evidence
- `@peac/adapter-x402` (Layer 4): x402 payment flow integration

## For Agent Developers

If you are building an AI agent that processes Stripe payments:

- Use `fromCheckoutSession` or `fromPaymentIntent` to capture fiat payment evidence
- Use `fromCryptoPaymentIntent` for x402 machine-to-machine crypto payments
- Use SPT functions for delegated payment flows in the Stripe Agentic Commerce suite
- SPT grant/use/deactivate record delegation acts, not payment finality
- Only `fromStripePaymentIntentObservation` may emit commerce events when the PaymentIntent status proves payment state
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
