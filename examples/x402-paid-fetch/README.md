# x402 Paid Fetch Demo

Demonstrates the complete 402→pay→200 flow with PEAC receipts.

## Quick Start

```bash
# Terminal 1: Start server
cd examples/x402-paid-fetch
npx tsx server.ts

# Terminal 2: Run client
npx tsx client.ts
```

## Flow

1. **Initial Request** → `402 Payment Required`
   - Server returns RFC 9457 Problem+JSON with payment requirements
   - `Retry-After: 0` indicates immediate retry allowed

2. **Payment + Retry** → `200 OK` with content
   - Client includes `X-PAYMENT` header with payment proof
   - Server validates payment via facilitator
   - Server returns content + `PEAC-Receipt` header

3. **Receipt Verification**
   - Receipt is detached JWS with PEAC claims
   - Includes payment evidence and facilitator verification
   - Ready for independent verification by third parties

## Sample Output

```
🚀 Starting x402 demo flow...

📞 Step 1: Making initial request...
✅ Got 402 Payment Required
💰 Payment requirements: { scheme: 'x402', network: 'base-mainnet', amount: '1000000' }

💳 Step 2: Simulating payment and retrying...
✅ Got 200 OK with content
🧾 Receipt received: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6...

📄 Receipt payload:
  - Type: application/peac-receipt+jws
  - Issuer: https://demo.x402-server.com
  - Subject: urn:resource:sha256:placeholder-hash-for-demo
  - Payment scheme: x402
  - Issued at: 2025-01-15T10:30:45.123Z

📝 Received content:
{
  "message": "This is premium content!",
  "access_tier": "premium",
  "timestamp": "2025-01-15T10:30:45.123Z"
}

🎉 Demo complete!
```

## API Endpoints

- `GET /paid-content` - Protected resource requiring x402 payment
- `GET /.well-known/aipref.json` - Policy discovery
- `GET /health` - Server health check

## Headers

- **Request**: `X-PAYMENT: <payment_json>`
- **Response**: `PEAC-Receipt: <jws>` (on 200 only)
- **CORS**: `Access-Control-Expose-Headers: PEAC-Receipt`

## Standards Compliance

- RFC 9457: Problem Details for HTTP APIs
- x402: Payment Required status code
- PEAC: Receipt format with JWS signing
- CORS: Proper header exposure for browser clients
