# x402 Adapter Migration: v0.12.0 to v0.12.1

This guide covers breaking changes in `@peac/adapter-x402` between v0.12.0 and v0.12.1.

## Field-by-field changes

| Field                                 | v0.12.0                                 | v0.12.1                                                            |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `OfferPayload.version`                | `string` (`"1"`)                        | `number` (`1`)                                                     |
| `OfferPayload.resourceUrl`            | absent                                  | required `string`                                                  |
| `OfferPayload.scheme`                 | optional                                | required                                                           |
| `OfferPayload.settlement`             | optional `JsonObject`                   | removed                                                            |
| `ReceiptPayload`                      | `txHash`, optional `asset/amount/payTo` | `resourceUrl/payer/issuedAt/transaction?`                          |
| `SignedOffer`                         | always has `payload`                    | JWS: `{ format: 'jws', signature }` (no `payload`)                 |
| `SignedReceipt`                       | always has `payload`                    | JWS: `{ format: 'jws', signature }` (no `payload`)                 |
| `X402PaymentRequired.offer`           | single `SignedOffer`                    | renamed to `X402OfferReceiptChallenge`, `offers: RawSignedOffer[]` |
| `X402PaymentRequired.acceptIndex`     | top-level                               | per-offer on `SignedOffer`                                         |
| `X402AdapterConfig.supportedVersions` | `string[]`                              | `number[]`                                                         |
| `AcceptEntry.scheme`                  | optional                                | required                                                           |
| `evidence.txHash`                     | required                                | `evidence.transaction` (optional)                                  |
| `evidence.resourceUrl`                | absent                                  | from offer (signed)                                                |
| `evidence.payer`                      | absent                                  | from receipt                                                       |
| `evidence.issuedAt`                   | absent                                  | from receipt                                                       |

## Verification API

The verification API surface expanded from a single function to three:

```typescript
// v0.12.0
import { verifyOffer } from '@peac/adapter-x402';
const result = verifyOffer(offer, accepts, config);

// v0.12.1
import { verifyOffer, verifyReceipt, verifyOfferReceiptConsistency } from '@peac/adapter-x402';
const offerResult = verifyOffer(offer, accepts, config);
const receiptResult = verifyReceipt(receipt, config);
const consistency = verifyOfferReceiptConsistency(offerPayload, receiptPayload, config);
```

## Discriminated unions

Signed artifacts are now discriminated unions by `format`. JWS variants have no `payload` field:

```typescript
// v0.12.0: payload always present
const payload = signedOffer.payload;

// v0.12.1: check format first
if (signedOffer.format === 'eip712') {
  const payload = signedOffer.payload;
} else {
  // JWS: payload is inside the compact JWS string
  // Use extractOfferPayload() to decode
  const payload = extractOfferPayload(signedOffer);
}
```

## Finding old-shape usage

```bash
# Find old ReceiptPayload.txHash usage
grep -rn '\.txHash' packages/ tests/ examples/

# Find old single-offer usage
grep -rn '\.offer[^s]' packages/adapters/x402/

# Find old string version comparisons
grep -rn "version.*['\"]1['\"]" packages/adapters/x402/

# Find old settlement field usage
grep -rn '\.settlement' packages/adapters/x402/

# Find old X402PaymentRequired references
grep -rn 'X402PaymentRequired' packages/ tests/ examples/
```

## TypeScript compiler as migration tool

Enable strict mode and follow compile errors. Every removed, renamed, or retyped field produces a compile error at the call site. No runtime compatibility layer is provided; v0.12.x is pre-1.0 and clean breaks are the correct approach.
