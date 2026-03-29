# @peac/rails-razorpay

Razorpay payment rail adapter for PEAC protocol: normalizes UPI, card, netbanking, and wallet payments to signed evidence receipts with webhook signature verification and VPA privacy.

## Installation

```bash
pnpm add @peac/rails-razorpay
```

## What It Does

`@peac/rails-razorpay` verifies Razorpay webhook signatures and maps payment events to PEAC `PaymentEvidence` for inclusion in signed interaction receipts. It supports UPI, card, netbanking, and wallet payment methods. VPA addresses are HMAC-hashed by default for privacy, amounts are kept as safe integer minor units (paise for INR), and webhook verification uses raw bytes with constant-time comparison.

## How Do I Use It?

### Verify webhook signature and normalize payment

```typescript
import {
  verifyWebhookSignature,
  normalizeRazorpayPayment,
  type RazorpayConfig,
} from '@peac/rails-razorpay';

const config: RazorpayConfig = {
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
};

// 1. Get raw body (NOT parsed JSON)
const rawBody: Uint8Array = req.rawBody;
const signature = req.headers['x-razorpay-signature'] as string;

// 2. Verify signature (throws on failure)
verifyWebhookSignature(rawBody, signature, config.webhookSecret);

// 3. Parse and normalize (after verification)
const event = JSON.parse(Buffer.from(rawBody).toString('utf-8'));
const evidence = normalizeRazorpayPayment(event, config);
// evidence.rail === 'razorpay'
// evidence.currency === 'INR'
// evidence.evidence.method === 'upi' | 'card' | 'netbanking' | 'wallet'
```

### Non-throwing signature check

```typescript
import { isWebhookSignatureValid } from '@peac/rails-razorpay';

const valid = isWebhookSignatureValid(rawBody, signature, webhookSecret);
if (!valid) {
  res.status(401).send('Invalid signature');
  return;
}
```

### Normalize a payment entity directly

```typescript
import { normalizePaymentEntity, type RazorpayConfig } from '@peac/rails-razorpay';

const config: RazorpayConfig = {
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  keyId: 'rzp_live_abc',
};

const evidence = normalizePaymentEntity(
  {
    id: 'pay_abc123',
    entity: 'payment',
    amount: 50000,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    vpa: 'user@bank',
    international: false,
    amount_refunded: 0,
    captured: true,
    created_at: 1711900000,
  },
  config
);
// evidence.amount === 50000 (paise, no division)
// evidence.evidence.vpa_hash === '<hmac-sha256 hex>'
```

### Hash a VPA address

```typescript
import { hashVpa } from '@peac/rails-razorpay';

const hash = hashVpa('user@oksbi', 'your-hmac-key');
// Hex-encoded HMAC-SHA256 hash for privacy-safe storage
```

## Integrates With

- `@peac/kernel` (Layer 0): Types and constants
- `@peac/schema` (Layer 1): `PaymentEvidence` schema validation
- `@peac/protocol` (Layer 3): Receipt issuance using normalized evidence

## For Agent Developers

If you are building an AI agent that processes Razorpay payments:

- Always verify webhook signatures using raw bytes before parsing JSON
- VPA addresses are HMAC-hashed by default; opt in to raw storage only with explicit consent via `privacy.storeRawVpa: true`
- Amounts are in minor units (paise for INR); the adapter enforces `Number.isSafeInteger` and never divides
- Supported events: `payment.authorized`, `payment.captured`, `payment.failed`
- Use `RazorpayError` codes for structured error handling in your webhook handler
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
