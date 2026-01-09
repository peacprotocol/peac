# Faremeter Adapter Implementation Plan

PEAC Protocol adapter for Faremeter metering and billing.

**Status:** Planning (v0.9.28 P2 - Deferred)
**Package:** `@peac/adapter-faremeter` (proposed)
**Layer:** 4 (Adapters)

## Overview

Faremeter provides usage-based billing infrastructure. This adapter bridges Faremeter events to PEAC receipt evidence.

## Package Structure

```
packages/adapters/faremeter/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main exports
│   ├── adapter.ts            # Core adapter logic
│   ├── types.ts              # Faremeter types
│   ├── evidence.ts           # Evidence mapping
│   └── validation.ts         # Event validation
├── tests/
│   ├── adapter.test.ts
│   ├── evidence.test.ts
│   └── validation.test.ts
└── README.md
```

## API Design

### Adapter Interface

```typescript
import type { PaymentEvidence, PEACError } from '@peac/schema';
import type { Result } from '@peac/adapter-core';

export interface FaremeterEvent {
  id: string;
  type: 'usage.metered' | 'subscription.charged' | 'invoice.paid';
  created: number;
  data: {
    customer_id: string;
    meter_id?: string;
    usage_quantity?: number;
    usage_unit?: string;
    amount: number;
    currency: string;
    invoice_id?: string;
    subscription_id?: string;
  };
}

export interface FaremeterEvidence {
  event_id: string;
  event_type: string;
  customer_id: string;
  meter_id?: string;
  usage_quantity?: number;
  usage_unit?: string;
  invoice_id?: string;
  subscription_id?: string;
}

export class FaremeterAdapter {
  /**
   * Converts Faremeter event to PEAC receipt evidence.
   *
   * @param event - Faremeter webhook event
   * @returns Result<PaymentEvidence, PEACError>
   */
  static toPaymentEvidence(event: FaremeterEvent): Result<PaymentEvidence, PEACError> {
    // 1. Validate event structure
    // 2. Map event data to PaymentEvidence
    // 3. Create evidence with Faremeter-specific fields
    // 4. Return Result
  }

  /**
   * Validates Faremeter webhook signature.
   *
   * @param payload - Raw webhook payload
   * @param signature - Faremeter-Signature header
   * @param secret - Webhook secret
   * @returns true if valid, false otherwise
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // HMAC-SHA256 verification
  }
}
```

### Event Mapping

```typescript
export function mapFaremeterEvent(event: FaremeterEvent): PaymentEvidence {
  return {
    rail: 'faremeter',
    facilitator: 'faremeter',
    reference: event.id,
    amount: event.data.amount,
    currency: event.data.currency.toUpperCase(),
    env: event.livemode ? 'live' : 'test',
    evidence: {
      event_id: event.id,
      event_type: event.type,
      customer_id: event.data.customer_id,
      meter_id: event.data.meter_id,
      usage_quantity: event.data.usage_quantity,
      usage_unit: event.data.usage_unit,
      invoice_id: event.data.invoice_id,
      subscription_id: event.data.subscription_id,
    } as FaremeterEvidence,
  };
}
```

### Usage Example

```typescript
import { FaremeterAdapter } from '@peac/adapter-faremeter';
import { issue } from '@peac/protocol';

// Webhook handler
app.post('/webhooks/faremeter', async (req, res) => {
  const signature = req.headers['faremeter-signature'];
  const payload = req.body;

  // Verify signature
  const isValid = FaremeterAdapter.verifyWebhookSignature(
    JSON.stringify(payload),
    signature,
    process.env.FAREMETER_WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Convert to PaymentEvidence
  const result = FaremeterAdapter.toPaymentEvidence(payload);

  if (!result.ok) {
    return res.status(400).json({ error: result.error.message });
  }

  const evidence = result.value;

  // Issue PEAC receipt
  const receipt = await issue(
    {
      iss: 'https://api.example.com',
      aud: 'https://agent.example.com',
      amt: evidence.amount,
      cur: evidence.currency,
      rail: evidence.rail,
      reference: evidence.reference,
      evidence: evidence.evidence,
    },
    privateKey,
    keyID
  );

  res.json({ receipt: receipt.jws });
});
```

## Implementation Details

### Webhook Signature Verification

Faremeter uses HMAC-SHA256 for webhook signatures:

```typescript
import { createHmac } from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const computed = hmac.digest('hex');

  // Constant-time comparison
  return timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
}
```

### Event Types

| Faremeter Event        | PEAC Mapping    | Notes                         |
| ---------------------- | --------------- | ----------------------------- |
| `usage.metered`        | PaymentEvidence | Usage-based billing event     |
| `subscription.charged` | PaymentEvidence | Recurring subscription charge |
| `invoice.paid`         | PaymentEvidence | Invoice payment confirmation  |

### Evidence Fields

```typescript
interface FaremeterEvidence {
  event_id: string; // Unique event ID
  event_type: string; // Event type
  customer_id: string; // Faremeter customer ID
  meter_id?: string; // Meter ID (for usage.metered)
  usage_quantity?: number; // Usage amount
  usage_unit?: string; // Usage unit (e.g., "requests", "GB")
  invoice_id?: string; // Invoice ID (for invoice.paid)
  subscription_id?: string; // Subscription ID
}
```

### Error Handling

```typescript
export enum FaremeterErrorCode {
  INVALID_EVENT_FORMAT = 'faremeter_invalid_event_format',
  MISSING_REQUIRED_FIELD = 'faremeter_missing_required_field',
  INVALID_SIGNATURE = 'faremeter_invalid_signature',
  UNSUPPORTED_EVENT_TYPE = 'faremeter_unsupported_event_type',
}

export class FaremeterError extends Error {
  constructor(
    public code: FaremeterErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'FaremeterError';
  }
}
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { FaremeterAdapter } from '../src/adapter';

describe('FaremeterAdapter', () => {
  it('should map usage.metered event to PaymentEvidence', () => {
    const event: FaremeterEvent = {
      id: 'evt_abc123',
      type: 'usage.metered',
      created: 1700000000,
      data: {
        customer_id: 'cus_xyz',
        meter_id: 'meter_api_calls',
        usage_quantity: 1000,
        usage_unit: 'requests',
        amount: 1000,
        currency: 'usd',
      },
    };

    const result = FaremeterAdapter.toPaymentEvidence(event);

    expect(result.ok).toBe(true);
    expect(result.value.rail).toBe('faremeter');
    expect(result.value.amount).toBe(1000);
    expect(result.value.currency).toBe('USD');
    expect(result.value.evidence.meter_id).toBe('meter_api_calls');
  });

  it('should verify webhook signature', () => {
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'whsec_test123';
    const signature = createHmac('sha256', secret).update(payload).digest('hex');

    const isValid = FaremeterAdapter.verifyWebhookSignature(payload, signature, secret);

    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'whsec_test123';
    const invalidSignature = 'invalid';

    const isValid = FaremeterAdapter.verifyWebhookSignature(payload, invalidSignature, secret);

    expect(isValid).toBe(false);
  });
});
```

## Integration Example

### Express.js Webhook Handler

```typescript
import express from 'express';
import { FaremeterAdapter } from '@peac/adapter-faremeter';
import { issue } from '@peac/protocol';

const app = express();

app.post('/webhooks/faremeter', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['faremeter-signature'] as string;
  const payload = req.body.toString('utf8');
  const secret = process.env.FAREMETER_WEBHOOK_SECRET!;

  // Verify signature
  if (!FaremeterAdapter.verifyWebhookSignature(payload, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse event
  const event = JSON.parse(payload);

  // Convert to PaymentEvidence
  const result = FaremeterAdapter.toPaymentEvidence(event);

  if (!result.ok) {
    return res.status(400).json({ error: result.error.message });
  }

  // Issue receipt
  const receipt = await issue(
    {
      iss: 'https://api.example.com',
      aud: 'https://agent.example.com',
      amt: result.value.amount,
      cur: result.value.currency,
      rail: result.value.rail,
      reference: result.value.reference,
      evidence: result.value.evidence,
    },
    privateKey,
    keyID
  );

  // Acknowledge webhook
  res.json({ received: true, receipt: receipt.jws });
});
```

## Dependencies

```json
{
  "name": "@peac/adapter-faremeter",
  "version": "0.9.28",
  "dependencies": {
    "@peac/schema": "workspace:*",
    "@peac/adapter-core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0"
  }
}
```

## Documentation

### README.md

- Installation instructions
- Quick start example
- Webhook setup guide
- API reference
- Troubleshooting

### Examples

- Express.js webhook handler
- Next.js API route
- Cloudflare Worker webhook
- Signature verification examples

## Acceptance Criteria

- [ ] Adapter converts Faremeter events to PaymentEvidence
- [ ] Webhook signature verification (HMAC-SHA256)
- [ ] Support for usage.metered, subscription.charged, invoice.paid events
- [ ] Error handling with typed error codes
- [ ] 30+ unit tests covering all event types
- [ ] Integration examples for Express, Next.js, Cloudflare
- [ ] Documentation (README, API reference)
- [ ] Published to npm as @peac/adapter-faremeter

## Timeline

- **Research:** 1 day (Faremeter API documentation, webhook format)
- **Implementation:** 2 days (adapter, validation, evidence mapping)
- **Testing:** 1 day (unit tests, integration tests)
- **Documentation:** 1 day (README, examples)
- **Total:** 5 days

## References

- Faremeter API Docs: <https://docs.faremeter.com>
- PEAC Adapter Pattern: [adapter-x402-daydreams](../../packages/adapters/x402/daydreams/)
- Adapter Core: [@peac/adapter-core](../../packages/adapters/core/)
