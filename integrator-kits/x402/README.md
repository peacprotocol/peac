# PEAC Integration Kit: x402 (HTTP 402 Payment Protocol)

Integration guide for recording PEAC evidence from x402 payment flows.

## What You Need

- `@peac/adapter-x402`: offer/receipt verification, evidence mapping, carrier adapter

## What You Get

- x402 offer and receipt verification (4-layer architecture)
- PEAC interaction records from x402 payment flows
- v1/v2 dual-header read compatibility (v0.12.4+)

## Quick Start

```bash
npm install @peac/adapter-x402
```

### Extract Receipt Evidence

```typescript
import { extractReceiptArtifactFromHeaders, fromOfferResponse } from '@peac/adapter-x402';

// Extract from HTTP response headers (priority: PEAC-Receipt > v2 > v1)
const artifact = extractReceiptArtifactFromHeaders(responseHeaders);

if (artifact) {
  console.log(artifact.source); // 'peac' | 'x402_v2' | 'x402_v1'
  console.log(artifact.isPeacReceipt); // true only for PEAC-Receipt
  console.log(artifact.artifactFormat); // 'jws' | 'json' | 'unknown'
}

// Full carrier extraction
const result = fromOfferResponse(responseHeaders);
if (result) {
  // result.receipts[0].receipt_jws: only set for PEAC source
  // result.upstreamArtifact: raw x402 artifact when source is v1/v2
}
```

### v1/v2 Dual-Header Read

The adapter reads both x402 header generations for backward compatibility:

| Priority | Header               | Version | Format      |
| -------- | -------------------- | ------- | ----------- |
| 1        | `PEAC-Receipt`       | PEAC    | Compact JWS |
| 2        | `PAYMENT-RESPONSE`   | x402 v2 | JSON        |
| 3        | `X-PAYMENT-RESPONSE` | x402 v1 | JSON        |

`PAYMENT-REQUIRED` is NOT read in the receipt path (it is challenge material).

### Verify Offer/Receipt

```typescript
import { verifyOffer, verifyReceipt } from '@peac/adapter-x402';

const offerResult = verifyOffer(signedOffer);
const receiptResult = verifyReceipt(signedReceipt);
```

### Map to PEAC Record

```typescript
import { toPeacRecord, toPeacCarrier } from '@peac/adapter-x402';

const record = toPeacRecord(offer, receipt, config);
const carrier = await toPeacCarrier(receiptJws);
```

## Attach Path

PEAC writes `PEAC-Receipt` only. x402 V2 full adapter (mapping, verification, unified dispatchers) shipped in v0.12.6. Dual-header read (v1 + v2) shipped in v0.12.4. Scheme-agnostic posture (`exact`, `upto`, and future schemes) verified in v0.12.9.

## Reference

- `@peac/adapter-x402`: verification, mapping, carrier adapter
- x402 V2: https://github.com/x402-foundation/x402
- x402 Foundation: https://x402.org
