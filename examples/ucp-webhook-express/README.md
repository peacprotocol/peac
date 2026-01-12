# UCP Webhook Express Example

This example demonstrates how to receive and process Google Universal Commerce Protocol (UCP) order webhooks using Express.js.

## Features

- Webhook signature verification (raw-first, JCS fallback)
- UCP order to PEAC receipt mapping
- Dispute evidence generation for offline verification

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the server
pnpm run start

# In another terminal, run the demo
pnpm run demo
```

## How It Works

1. **Webhook Reception**: The server receives POST requests at `/webhooks/ucp/orders` with a `Request-Signature` header containing a detached JWS.

2. **Signature Verification**: The `@peac/mappings-ucp` package verifies the signature:
   - First tries raw request body bytes
   - Falls back to JCS-canonicalized body if raw fails
   - Records all verification attempts for debugging

3. **Receipt Mapping**: UCP order data is mapped to PEAC receipt claims:
   - Amounts in minor units (cents)
   - Extensions use `dev.ucp/*` namespace
   - Order status derived from line item fulfillment

4. **Evidence Creation**: Dispute evidence is created for offline verification:
   - Full signature header preserved
   - Both raw and JCS payload hashes stored
   - Profile snapshot for key rotation scenarios

## API Endpoints

### POST /webhooks/ucp/orders

Receives UCP order webhooks.

**Headers:**

- `Content-Type: application/json`
- `Request-Signature: <detached-jws>`

**Response (success):**

```json
{
  "status": "processed",
  "receipt_id": "rcpt_...",
  "receipt_jws": "eyJ...",
  "event_type": "order.created",
  "order_id": "order_..."
}
```

### GET /health

Health check endpoint.

### GET /.well-known/ucp

Mock UCP profile (for demo purposes).

## Production Considerations

1. **Key Management**: Load signing keys from secure storage (HSM, KMS, etc.)
2. **Profile Fetching**: Fetch and cache business UCP profiles with TTL
3. **Evidence Storage**: Persist evidence YAML to database for dispute bundles
4. **Rate Limiting**: Add rate limiting for webhook endpoints
5. **Idempotency**: Track processed webhooks to prevent duplicates

## Related Packages

- `@peac/mappings-ucp` - UCP to PEAC mapping
- `@peac/protocol` - Receipt signing
- `@peac/audit` - Dispute bundle creation
