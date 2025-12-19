# Pay-Per-Inference Example

Demonstrates the core PEAC receipt flow for AI inference payments.

## What This Shows

1. **Agent makes request** to a protected resource (no receipt)
2. **Resource returns 402** with payment requirements (price, currency, issuer)
3. **Agent obtains receipt** from payment service (simulated)
4. **Agent retries** with `PEAC-Receipt` header
5. **Resource verifies** receipt and grants access
6. **Normalization** using `toCoreClaims()` for cross-mapping parity

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Running the Demo

```bash
cd examples/pay-per-inference
pnpm demo
```

Expected output:

```
=== PEAC Pay-Per-Inference Demo ===

1. Agent requests resource (no receipt)...
   -> 402 Payment Required
   -> Price: 100 USD
   -> Issuer: https://payment.example.com

2. Agent obtains receipt from payment service...
   -> Receipt obtained (xxx chars)

3. Agent retries with receipt...
   -> 200 OK - Access granted!
   -> Response: {"result":"Hello! I am a simulated GPT-4 response.","tokens_used":42}

4. Demonstrating toCoreClaims() normalization...
   -> Core claims (normalized):
      iss: https://payment.example.com
      aud: https://api.example.com/inference/gpt-4
      amt: 100 USD
      payment.rail: demo
   -> Canonical JCS (xxx bytes)

=== Demo Complete ===
```

## Key Concepts

### 402 Payment Required

The resource server returns HTTP 402 with:

- `PEAC-Price`: Amount in smallest currency unit
- `PEAC-Currency`: ISO 4217 currency code
- `PEAC-Issuer`: URL of the receipt issuer

### Receipt Verification

The resource server verifies:

1. JWS signature is valid
2. `aud` matches the resource URL
3. `amt` and `cur` meet the price requirement

### Core Claims Normalization

`toCoreClaims()` extracts semantic fields for comparison:

- Strips rail-specific evidence
- Produces byte-identical JCS output regardless of source

## No External Dependencies

This example uses:

- Local keypair generation
- Simulated payment service
- In-memory verification

No network calls, no secrets required.
