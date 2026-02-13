# Stripe x402 Machine Payments Profile

**Status:** Draft
**Since:** v0.10.11
**Package:** `@peac/rails-stripe`
**Function:** `fromCryptoPaymentIntent()`

## Abstract

This profile describes how to normalize Stripe crypto payment intents into PEAC PaymentEvidence for x402 machine-to-machine payment flows. It covers the mapping between Stripe's crypto payment data and PEAC's payment evidence structure.

## Use Case

Machine-to-machine payments settled through Stripe's x402 crypto integration. An AI agent pays for an API call using USDC on Base via Stripe, and the provider issues a PEAC receipt with crypto payment evidence.

```text
Agent -> Stripe (x402) -> Provider API -> PEAC Receipt
         USDC/Base                        PaymentEvidence
```

## Mapping

### Input: StripeCryptoPaymentIntent

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | string | Yes | Stripe payment intent ID (e.g., `pi_3QxYz...`) |
| `amount` | number | Yes | Amount in smallest currency unit (cents) |
| `currency` | string | Yes | Fiat currency code, lowercase ISO 4217 (e.g., `usd`) |
| `asset` | string | Yes | Crypto asset ticker (e.g., `usdc`, `eth`) |
| `network` | string | Yes | Network identifier, CAIP-2 format (e.g., `eip155:8453`) |
| `tx_hash` | string | No | On-chain transaction hash |
| `recipient` | string | No | Recipient wallet address |
| `customer` | string | No | Stripe customer ID |
| `metadata` | object | No | Stripe metadata (key-value strings) |

### Output: PaymentEvidence

| Field | Value | Notes |
| ----- | ----- | ----- |
| `rail` | `"stripe"` | Stripe is the payment facilitator |
| `reference` | `intent.id` | Stripe payment intent ID |
| `amount` | `intent.amount` | Passed through unchanged |
| `currency` | `intent.currency.toUpperCase()` | Fiat denomination (e.g., `"USD"`) |
| `asset` | `intent.asset.toUpperCase()` | Crypto token (e.g., `"USDC"`) |
| `env` | `"live"` or `"test"` | Caller-specified |
| `network` | `intent.network` | CAIP-2 identifier (e.g., `"eip155:8453"`) |
| `evidence` | object | See below |

### Evidence Object

| Field | Source | Presence |
| ----- | ------ | -------- |
| `payment_intent_id` | `intent.id` | Always |
| `asset` | `intent.asset.toUpperCase()` | Always |
| `network` | `intent.network` | Always |
| `tx_hash` | `intent.tx_hash` | If provided |
| `recipient` | `intent.recipient` | If provided |
| `customer_id` | `intent.customer` | If provided |
| `metadata` | `intent.metadata` | If provided |

## Key Distinction: Fiat vs Crypto

| | `fromPaymentIntent()` (fiat) | `fromCryptoPaymentIntent()` (crypto) |
| --- | --- | --- |
| `asset` | Same as `currency` (e.g., `"USD"`) | Crypto token (e.g., `"USDC"`) |
| `network` | Not set | CAIP-2 ID (e.g., `"eip155:8453"`) |
| `evidence` | `payment_intent_id`, `customer_id` | Adds `asset`, `network`, `tx_hash`, `recipient` |

## Supported Networks

Common CAIP-2 identifiers for Stripe crypto payments:

| Network | CAIP-2 ID | Common Assets |
| ------- | --------- | ------------- |
| Ethereum mainnet | `eip155:1` | ETH, USDC, USDT |
| Base mainnet | `eip155:8453` | ETH, USDC |
| Base Sepolia (testnet) | `eip155:84532` | ETH, USDC |
| Solana mainnet | `solana:mainnet` | SOL, USDC |

## Validation Rules

1. `id` MUST be a non-empty string
2. `amount` MUST be a non-negative number
3. `currency` MUST match `/^[a-z]{3}$/` (lowercase ISO 4217)
4. `asset` MUST be a non-empty string
5. `network` MUST be CAIP-2 format: `/^[a-z][a-z0-9-]{2,31}:[a-zA-Z0-9]{1,64}$/`
6. `tx_hash`, if present, MUST be a non-empty string (opaque -- no chain-specific validation)
7. `recipient`, if present, MUST be a non-empty string (opaque -- no chain-specific validation)

Violations throw with descriptive error messages. No silent coercion.

**Note on tx_hash and recipient:** These fields are treated as opaque strings.
Chain-specific validation (e.g., 0x-prefix for EVM, base58 for Solana) is intentionally
not performed -- the adapter normalizes, it does not interpret chain semantics.

## Quick Demo

Normalize a crypto payment, issue a PEAC receipt, and verify offline -- in one command:

```bash
pnpm --filter @peac/example-stripe-x402-crypto demo
```

See `examples/stripe-x402-crypto/demo.ts` for the full source. Runs in under 5 seconds,
no network or Stripe API needed.

## Conformance Vectors

See `specs/conformance/fixtures/stripe-crypto/` for test vectors:

- `minimal-crypto-intent.json` -- required fields only
- `full-crypto-intent.json` -- all fields populated
- `missing-required-fields.json` -- validation error cases (8 cases)

Vectors are executed by the conformance runner at
`packages/rails/stripe/tests/conformance.test.ts`.

## Example

```typescript
import { fromCryptoPaymentIntent } from '@peac/rails-stripe';
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';

// Normalize Stripe crypto payment intent
const payment = fromCryptoPaymentIntent({
  id: 'pi_3QxYz1234567890',
  amount: 500,
  currency: 'usd',
  asset: 'usdc',
  network: 'eip155:8453',
  tx_hash: '0xabc123...',
});

// Issue a PEAC receipt with the payment evidence
const { privateKey } = await generateKeypair();
const receipt = await issue({
  iss: 'https://api.example.com',
  aud: 'https://agent.example.com',
  amt: payment.amount,
  cur: payment.currency,
  rail: payment.rail,
  reference: payment.reference,
  privateKey,
  kid: '2026-02-13',
});

console.log('Receipt JWS:', receipt.jws);
// Verify offline with receipt.jws + public key
```
