# x402 + PEAC Integration Guide

This guide explains how to integrate PEAC receipts with x402 HTTP 402 payment flows.

**Live demo:** [x402.peacprotocol.org](https://x402.peacprotocol.org) | [Visual demo repo](https://github.com/peacprotocol/peac-x402-receipts-demo)

## Overview

[x402](https://x402.org) is an open standard for HTTP 402 payments. PEAC adds a cryptographic receipts layer on top:

| Layer    | What It Does                              |
| -------- | ----------------------------------------- |
| **x402** | Handles payment (Base/USDC, Solana, etc.) |
| **PEAC** | Proves payment happened (signed receipt)  |

Together they enable:

- Instant payments via crypto rails
- Offline-verifiable proof of payment
- Audit trail with payment evidence

## Quick Start

### 1. Install

```bash
pnpm add @peac/protocol @peac/crypto @peac/rails-x402
```

### 2. Issue a Receipt After Payment

```typescript
import { issue } from '@peac/protocol';

const result = await issue({
  iss: 'https://your-api.com',
  aud: 'https://your-api.com/resource',
  amt: 100, // cents
  cur: 'USD',
  rail: 'x402',
  reference: `x402_${paymentId}`,
  asset: 'USDC',
  env: 'live',
  evidence: {
    network: 'eip155:8453', // Base mainnet
    tx_hash: txHash,
    recipient: recipientAddress,
    x402_version: 'v2',
  },
  privateKey,
  kid: 'your-key-id',
});

// Set the PEAC-Receipt header in your response
response.setHeader('PEAC-Receipt', result.jws);
```

### 3. Verify a Receipt

```typescript
import { verifyReceipt } from '@peac/protocol';

const result = await verifyReceipt(receiptJws);

if (result.ok) {
  console.log('Payment verified:', result.claims.payment?.evidence?.tx_hash);
} else {
  console.error('Invalid receipt:', result.error);
}
```

## HTTP Flow

```
Client                              Server
  |                                    |
  | 1. GET /resource                   |
  |----------------------------------->|
  |                                    |
  | 2. 402 Payment Required            |
  |    Payment-Required: {...}         |
  |    PEAC-Issuer: https://...        |
  |<-----------------------------------|
  |                                    |
  | 3. Pay via x402 SDK                |
  |----------------------------------->|
  |                                    |
  | 4. 200 OK                          |
  |    PEAC-Receipt: eyJhbG...         |
  |<-----------------------------------|
  |                                    |
  | 5. Verify receipt offline          |
```

### 402 Response Headers (x402 v2)

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
Payment-Required: {"network":"eip155:8453","asset":"USDC","amount":"100","recipient":"0x..."}
PEAC-Issuer: https://your-api.com
```

### 200 Response with Receipt

```http
HTTP/1.1 200 OK
Content-Type: application/json
PEAC-Receipt: eyJhbGciOiJFZERTQSIsInR5cCI6InBlYWMtcmVjZWlwdC8wLjEifQ...
```

## x402 v2 Dialect

The `@peac/rails-x402` adapter supports both x402 v1 and v2:

```typescript
import { X402Adapter } from '@peac/rails-x402';

// Auto-detect v1 or v2 based on headers
const adapter = new X402Adapter({ dialect: 'auto' });

// Force v2 only
const v2Adapter = new X402Adapter({ dialect: 'v2' });
```

### Header Differences

| v1 Header            | v2 Header          |
| -------------------- | ------------------ |
| `X-PAYMENT`          | `Payment-Required` |
| `X-PAYMENT-RESPONSE` | `Payment-Response` |

## Supported Networks (CAIP-2)

| Network           | CAIP-2 ID        |
| ----------------- | ---------------- |
| Base Mainnet      | `eip155:8453`    |
| Base Sepolia      | `eip155:84532`   |
| Avalanche Mainnet | `eip155:43114`   |
| Avalanche Fuji    | `eip155:43113`   |
| Solana Mainnet    | `solana:mainnet` |
| Solana Devnet     | `solana:devnet`  |

## Discovery with peac.txt

Publish payment terms at `/.well-known/peac.txt`:

```yaml
version: 0.9.18
usage: conditional

receipts: required
rate_limit: 1000/hour

price: 0.50
currency: USD
payment_methods: [x402]
payment_networks: [eip155:8453, solana:mainnet]

negotiate: https://your-api.com/negotiate
```

## Receipt Structure

PEAC receipts with x402 evidence:

```json
{
  "typ": "peac-receipt/0.1",
  "iss": "https://your-api.com",
  "aud": "https://your-api.com/resource",
  "iat": 1703001234,
  "exp": 1703004834,
  "amt": 100,
  "cur": "USD",
  "payment": {
    "rail": "x402",
    "asset": "USDC",
    "env": "live",
    "reference": "x402_abc123",
    "evidence": {
      "network": "eip155:8453",
      "tx_hash": "0xabc...",
      "recipient": "0x123...",
      "x402_version": "v2"
    }
  }
}
```

## Verification Strategies

### At Request Time (Server)

```typescript
app.use(async (req, res, next) => {
  const receipt = req.headers['peac-receipt'];

  if (!receipt) {
    return res.status(402).json({
      type: 'https://www.peacprotocol.org/errors/payment-required',
      title: 'Payment Required',
      status: 402,
    });
  }

  const result = await verifyReceipt(receipt);
  if (!result.ok) {
    return res.status(401).json({
      type: 'https://www.peacprotocol.org/errors/invalid-receipt',
      title: 'Invalid Receipt',
      status: 401,
    });
  }

  req.receipt = result.claims;
  next();
});
```

### Offline (Client)

```typescript
import { verify } from '@peac/crypto';

// Client can verify without network calls
const { valid, payload } = await verify(receiptJws, issuerPublicKey);

if (valid) {
  console.log('Receipt is valid');
  console.log('Paid:', payload.amt, payload.cur);
  console.log('Expires:', new Date(payload.exp * 1000));
}
```

### Audit (Later)

Receipts can be stored and verified later for audit purposes:

```typescript
// Store receipt with request log
await db.insert('audit_log', {
  request_id: requestId,
  receipt_jws: receiptJws,
  timestamp: new Date(),
});

// Verify during audit
const receipts = await db.query('SELECT receipt_jws FROM audit_log WHERE ...');
for (const { receipt_jws } of receipts) {
  const result = await verifyReceipt(receipt_jws);
  // Check validity, amounts, timing, etc.
}
```

## Example: Express Server

```typescript
import express from 'express';
import { issue, verifyReceipt } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';

const app = express();
const { privateKey, publicKey } = await generateKeypair();

app.get('/premium', async (req, res) => {
  const receipt = req.headers['peac-receipt'] as string;

  if (!receipt) {
    return res.status(402).json({
      type: 'https://www.peacprotocol.org/errors/payment-required',
      title: 'Payment Required',
      x402: {
        network: 'eip155:8453',
        asset: 'USDC',
        amount: '100',
      },
    });
  }

  const result = await verifyReceipt(receipt);
  if (!result.ok) {
    return res.status(401).json({ error: 'Invalid receipt' });
  }

  res.json({ data: 'Premium content' });
});

// Endpoint called after x402 payment succeeds
app.post('/issue-receipt', async (req, res) => {
  const { resource, txHash, network } = req.body;

  const result = await issue({
    iss: 'https://your-api.com',
    aud: resource,
    amt: 100,
    cur: 'USD',
    rail: 'x402',
    reference: `x402_${txHash}`,
    asset: 'USDC',
    env: 'live',
    evidence: { network, tx_hash: txHash, x402_version: 'v2' },
    privateKey,
    kid: 'key-2025',
  });

  res.json({ receipt: result.jws });
});
```

## Resources

- **Live demo:** [x402.peacprotocol.org](https://x402.peacprotocol.org)
- **x402 spec:** [x402.org](https://x402.org)
- **Example code:** [examples/x402-node-server](../../examples/x402-node-server)
- **Stripe x402 crypto demo:** `pnpm --filter @peac/example-stripe-x402-crypto demo` ([source](../../examples/stripe-x402-crypto/demo.ts) | [profile](../profiles/stripe-x402-machine-payments.md))
- **Package (x402):** [@peac/rails-x402](../../packages/rails/x402)
- **Package (Stripe):** [@peac/rails-stripe](../../packages/rails/stripe)
