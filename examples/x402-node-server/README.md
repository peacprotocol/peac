# x402 + PEAC Integration Example

Demonstrates how PEAC receipts work with x402 HTTP 402 payment flows.

**Live demo:** [x402.peacprotocol.org](https://x402.peacprotocol.org) | [Visual demo repo](https://github.com/peacprotocol/peac-x402-receipts-demo)

## What This Shows

1. **Client requests** a protected resource (no receipt)
2. **Server returns 402** with x402 v2 payment requirements
3. **Client pays** via x402 (Base/USDC in this example)
4. **Server issues** a signed PEAC receipt with x402 evidence
5. **Client verifies** the receipt offline

## The x402 + PEAC Stack

```
+------------------+     +------------------+
|     Client       |     |     Server       |
+------------------+     +------------------+
         |                        |
         | 1. GET /resource       |
         |----------------------->|
         |                        |
         | 2. 402 Payment-Required|
         |   (x402 v2 headers)    |
         |<-----------------------|
         |                        |
         | 3. Pay via x402        |
         |   (Base/USDC)          |
         |----------------------->|
         |                        |
         | 4. 200 OK              |
         |   PEAC-Receipt: <jws>  |
         |<-----------------------|
         |                        |
         | 5. Verify offline      |
         |   (Ed25519 JWS)        |
+------------------+     +------------------+
```

## x402 v2 Headers

This example uses x402 v2 header format:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
Payment-Required: {"network":"eip155:8453","asset":"USDC","amount":"50","recipient":"0x...","resource":"..."}
PEAC-Issuer: https://payment.example.com
```

The `Payment-Required` header (v2) replaces the `X-PAYMENT` header from v1.

## PEAC Receipt with x402 Evidence

```json
{
  "typ": "peac.receipt/0.9",
  "iss": "https://payment.example.com",
  "aud": "https://api.example.com/premium/data",
  "amt": 50,
  "cur": "USD",
  "payment": {
    "rail": "x402",
    "asset": "USDC",
    "env": "live",
    "reference": "x402_1703001234567",
    "evidence": {
      "network": "eip155:8453",
      "tx_hash": "0xabc123...",
      "recipient": "0x1234...",
      "x402_version": "v2"
    }
  }
}
```

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running the Demo

```bash
cd examples/x402-node-server
pnpm demo
```

Expected output:

```
=== x402 + PEAC Integration Demo ===

Resource: https://api.example.com/premium/data
Network:  eip155:8453
Price:    $0.50 USDC

1. Client requests protected resource...
   -> 402 Payment Required
   -> Network: eip155:8453
   -> Asset: USDC
   -> Amount: 50

2. Client pays via x402...
   -> Payment confirmed
   -> PEAC receipt issued (xxx chars)

3. Client retries with PEAC-Receipt header...
   -> 200 OK - Access granted!
   -> Data: {"data":"Premium content unlocked via x402 payment","accessedAt":"..."}

4. Verify receipt offline...
   -> Receipt claims:
      iss: https://payment.example.com
      aud: https://api.example.com/premium/data
      amt: 50 USD
      rail: x402
      network: eip155:8453
      tx_hash: 0x...

=== Demo Complete ===
```

## Key Concepts

### x402 Handles Payment, PEAC Proves It

- **x402** is the payment rail (Base/USDC, Solana, etc.)
- **PEAC** is the receipt layer (cryptographic proof of payment)

Together they provide:

- Instant payments via crypto rails
- Offline-verifiable receipts
- Audit trail with payment evidence

### Supported Networks (CAIP-2)

| Network        | CAIP-2 ID        |
| -------------- | ---------------- |
| Base Mainnet   | `eip155:8453`    |
| Base Sepolia   | `eip155:84532`   |
| Solana Mainnet | `solana:mainnet` |
| Solana Devnet  | `solana:devnet`  |

### Receipt Verification

Clients can verify receipts:

1. **At request time** - Server verifies before granting access
2. **Offline** - Client verifies signature without network calls
3. **Later** - Audit systems can verify historical receipts

## Production Integration

For production x402 + PEAC integration:

1. **Server-side:** Use `@peac/rails-x402` adapter
2. **Discovery:** Publish `/.well-known/peac.txt` with payment terms
3. **x402 SDK:** Use Coinbase x402 SDK for payment handling

See the [x402 ecosystem](https://x402.org/ecosystem) for compatible tools and services.

## No External Dependencies

This example simulates:

- x402 payment confirmation
- PEAC receipt issuance
- Offline verification

No network calls or secrets required.
