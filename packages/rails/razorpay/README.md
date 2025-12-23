# @peac/rails-razorpay

Razorpay payment rail adapter for [PEAC Protocol](https://github.com/peacprotocol/peac).

Supports UPI, cards, netbanking, and wallets for India-focused payment flows.

## Installation

```bash
npm install @peac/rails-razorpay
# or
pnpm add @peac/rails-razorpay
```

## Features

- Webhook signature verification (raw bytes + constant-time compare)
- Payment normalization to PEAC PaymentEvidence
- VPA privacy (HMAC hashing by default)
- Safe integer amount handling (no float math)

## Quick Start

```typescript
import {
  verifyWebhookSignature,
  normalizeRazorpayPayment,
  type RazorpayConfig,
} from '@peac/rails-razorpay';

const config: RazorpayConfig = {
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
};

// In your webhook handler (see Raw Body section below):
// 1. Get raw body (NOT parsed JSON)
const rawBody = req.body as Buffer; // Buffer when using express.raw()
const signature = req.headers['x-razorpay-signature'];

// 2. Verify signature FIRST (before parsing)
verifyWebhookSignature(rawBody, signature, config.webhookSecret);

// 3. Parse and normalize (only after verification succeeds)
const event = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
const evidence = normalizeRazorpayPayment(event, config);

// 4. Use evidence in PEAC receipt
console.log(evidence);
// {
//   rail: 'razorpay',
//   reference: 'pay_123456789',
//   amount: 50000,       // Minor units (paise)
//   currency: 'INR',
//   asset: 'INR',
//   env: 'live',
//   evidence: { ... }
// }
```

## Raw Body Requirement (CRITICAL)

Webhook signature verification MUST use the raw request body. If you parse the JSON before verification, an attacker could modify the payload.

### Express

```typescript
import express from 'express';

const app = express();

// Use raw body parser for webhook endpoint
app.use('/webhook/razorpay', express.raw({ type: 'application/json' }));

app.post('/webhook/razorpay', (req, res) => {
  const rawBody = req.body as Buffer; // Uint8Array
  const signature = req.headers['x-razorpay-signature'] as string;

  try {
    verifyWebhookSignature(rawBody, signature, config.webhookSecret);
    const event = JSON.parse(rawBody.toString('utf-8'));
    const evidence = normalizeRazorpayPayment(event, config);
    // Process evidence...
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook verification failed:', err);
    res.status(401).send('Invalid signature');
  }
});
```

### Fastify

```typescript
import Fastify from 'fastify';

const fastify = Fastify();

// Add raw body parser
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  done(null, body);
});

fastify.post('/webhook/razorpay', async (request, reply) => {
  const rawBody = request.body as Buffer;
  const signature = request.headers['x-razorpay-signature'] as string;

  try {
    verifyWebhookSignature(rawBody, signature, config.webhookSecret);
    const event = JSON.parse(rawBody.toString('utf-8'));
    const evidence = normalizeRazorpayPayment(event, config);
    // Process evidence...
    return { status: 'ok' };
  } catch (err) {
    reply.code(401);
    return { error: 'Invalid signature' };
  }
});
```

### Next.js API Route

```typescript
// app/api/webhook/razorpay/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const signature = req.headers.get('x-razorpay-signature') || '';

  try {
    verifyWebhookSignature(rawBody, signature, config.webhookSecret);
    const event = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
    const evidence = normalizeRazorpayPayment(event, config);
    // Process evidence...
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
}
```

## Configuration

```typescript
interface RazorpayConfig {
  // Required: Webhook secret for signature verification
  // Found in Razorpay Dashboard > Webhooks > Secret
  webhookSecret: string;

  // Optional: Key ID for observability (included in evidence)
  keyId?: string;

  // Optional: Key Secret for API calls (not needed for webhooks)
  keySecret?: string;

  // Optional: Privacy settings
  privacy?: {
    // Store raw VPA instead of hash (default: false)
    // WARNING: Setting to true stores PII in receipts
    storeRawVpa?: boolean;

    // Custom HMAC key for VPA hashing (default: use webhookSecret)
    // Changing this changes all VPA hashes (affects audit trails)
    hashKey?: string;
  };
}
```

## VPA Privacy

By default, VPA addresses (e.g., `user@paytm`) are hashed using HMAC-SHA256 before being stored in the PaymentEvidence. This prevents dictionary attacks that would be possible with plain SHA256.

### Default Behavior (Hash)

```typescript
const config: RazorpayConfig = {
  webhookSecret: 'your_secret',
};

const evidence = normalizeRazorpayPayment(event, config);
// evidence.evidence.vpa_hash = "a1b2c3..." (HMAC-SHA256 of VPA)
// evidence.evidence.vpa = undefined (not stored)
```

### Custom Hash Key

```typescript
const config: RazorpayConfig = {
  webhookSecret: 'your_secret',
  privacy: {
    hashKey: 'custom_vpa_hash_key', // Separate key for VPA hashing
  },
};
```

### UNSAFE: Store Raw VPA

Only use this if you have explicit consent and a legitimate business need for storing raw VPA addresses.

```typescript
const config: RazorpayConfig = {
  webhookSecret: 'your_secret',
  privacy: {
    storeRawVpa: true, // WARNING: Stores PII
  },
};

const evidence = normalizeRazorpayPayment(event, config);
// evidence.evidence.vpa = "user@paytm" (raw VPA stored)
// evidence.evidence.vpa_hash = undefined
```

## Amount Handling

Razorpay amounts are in the smallest currency sub-unit (paise for INR). This adapter keeps them as-is without division:

```typescript
// Razorpay sends: amount: 50000 (500.00 INR in paise)
// PEAC stores:    amount: 50000 (integer minor units)
// NO division by 100 is performed
```

The adapter enforces:

- Amounts must be integers (throws on decimal)
- Amounts must be non-negative
- Amounts must be safe integers (`Number.isSafeInteger`)

## Supported Events

- `payment.authorized` - Payment authorized by bank
- `payment.captured` - Payment captured (funds transferred)
- `payment.failed` - Payment failed

Other Razorpay events (e.g., `order.paid`, `refund.created`) are not currently supported.

## Error Handling

All errors are instances of `RazorpayError` with structured error codes:

```typescript
import { RazorpayError } from '@peac/rails-razorpay';

try {
  verifyWebhookSignature(rawBody, signature, secret);
} catch (err) {
  if (err instanceof RazorpayError) {
    console.log(err.code); // 'signature_invalid'
    console.log(err.statusCode); // 401
    console.log(err.toProblemJson()); // RFC 9457 format
  }
}
```

Error codes:

- `signature_invalid` - Signature verification failed
- `signature_malformed` - Signature format is invalid
- `signature_length_mismatch` - Signature has wrong length
- `amount_out_of_range` - Amount exceeds safe integer
- `amount_invalid` - Amount is not a valid integer
- `currency_invalid` - Currency is not uppercase ISO 4217
- `event_type_unsupported` - Webhook event type not supported
- `payload_invalid` - Webhook payload format is invalid
- `payment_missing` - No payment entity in payload

## Threat Model

This adapter protects against:

1. **Signature bypass** - Always verify signature before parsing JSON
2. **Timing attacks** - Uses constant-time comparison (`timingSafeEqual`)
3. **VPA dictionary attacks** - HMAC hashing prevents rainbow table attacks
4. **Integer overflow** - Validates amounts are safe integers

The adapter does NOT protect against:

- Razorpay account compromise (use MFA, audit logs)
- Replay attacks (implement idempotency in your application)
- Network interception (Razorpay uses HTTPS)

## License

Apache-2.0

---

Built by [PEAC Protocol](https://peacprotocol.org) contributors.
