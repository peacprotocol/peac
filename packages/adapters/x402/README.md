# @peac/adapter-x402

x402 offer verification, receipt extraction, and PEAC interaction record mapping for the x402 Offer/Receipt extension.

## Installation

```bash
pnpm add @peac/adapter-x402
```

## What It Does

`@peac/adapter-x402` is a Layer 4 adapter that verifies x402 offer and receipt artifacts, extracts receipt data from HTTP response headers, and maps the results into canonical PEAC interaction records. It implements a verification-first architecture with layered checks: wire validation, term-matching (including the `scheme` identifier), offer-receipt consistency, and opt-in cryptographic verification. The adapter reads both PEAC-Receipt and upstream x402 response headers (v1 and v2) with priority-based fallback.

## Scheme scope

The adapter is **scheme-agnostic at the verification layer**. It preserves and
term-matches the x402 `scheme` identifier (`exact`, `upto`, or any future
upstream scheme) as a required string alongside `network`, `asset`, `payTo`,
and `amount`. The raw signed artifact is stored verbatim at
`proofs.x402.offer`, so downstream auditors retain the full scheme-level
payload for review.

The adapter **does not enforce scheme-specific invariants**. In particular,
for `upto` it does not enforce:

- Single-use authorization
- Time bounds (`validAfter` / `validBefore`)
- Recipient binding to a specific payee
- Facilitator binding
- Max-amount enforcement on-chain
- Phase-dependent amount semantics (verify returns authorized maximum; settle
  returns actual charged amount)

Those invariants are the x402 scheme layer's responsibility and are enforced
on-chain or by the facilitator, not by PEAC. PEAC captures and surfaces the
scheme identifier so downstream auditors can reason about phase semantics at
review time.

For current upstream truth and the PEAC-tested compatibility matrix, see
[`docs/compatibility/x402-scheme-coverage.md`](../../../docs/compatibility/x402-scheme-coverage.md)
and [`docs/specs/X402-PROFILE.md § 3.0`](../../../docs/specs/X402-PROFILE.md).

## How Do I Use It?

### Verify an offer against accept terms

```typescript
import { verifyOffer } from '@peac/adapter-x402';

const result = verifyOffer(signedOffer, acceptEntries);

if (result.valid) {
  console.log('Matched accept entry:', result.matchedAccept);
  console.log('Used hint:', result.usedHint);
} else {
  console.log('Verification failed:', result.errors);
}
```

### Extract receipt artifacts from HTTP response headers

```typescript
import { extractReceiptArtifactFromHeaders } from '@peac/adapter-x402';

// Dual-header read: checks PEAC-Receipt, then PAYMENT-RESPONSE (v2),
// then X-PAYMENT-RESPONSE (v1)
const artifact = extractReceiptArtifactFromHeaders(responseHeaders);

if (artifact) {
  console.log('Source:', artifact.source); // 'peac' | 'x402_v2' | 'x402_v1'
  console.log('Is PEAC receipt:', artifact.isPeacReceipt);
  console.log('Raw artifact:', artifact.rawArtifact);
}
```

### Build evidence carriers from x402 responses

```typescript
import { fromOfferResponse, X402CarrierAdapter } from '@peac/adapter-x402';

// Extract from an x402 402 response (offer)
const extraction = fromOfferResponse(response);
console.log('Carriers:', extraction.receipts);
console.log('Transport:', extraction.meta.transport);

// Or use the CarrierAdapter interface
const adapter = new X402CarrierAdapter();
```

### Map an x402 payment flow to a PEAC record

```typescript
import { toPeacRecord } from '@peac/adapter-x402';

const record = toPeacRecord(challenge, settlementResponse);
// record.proofs.x402.offer   -- raw offer preserved for audit
// record.proofs.x402.receipt  -- raw receipt preserved for audit
// record.evidence.resourceUrl -- from signed offer payload
// record.evidence.payer       -- from signed receipt payload
```

## Integrates With

- `@peac/adapter-core` (Layer 4): Shared Result types and validators
- `@peac/kernel` (Layer 0): Wire constants and evidence carrier types
- `@peac/schema` (Layer 1): Receipt ref computation and carrier validation
- `@peac/crypto` (Layer 2): JWS parsing utilities

## For Agent Developers

If you are building an AI agent that makes paid API calls via x402:

- Use `extractReceiptArtifactFromHeaders()` to capture receipt evidence from HTTP responses
- Use `verifyOffer()` and `verifyReceipt()` to validate x402 artifacts before accepting them
- Use `toPeacRecord()` to map verified x402 flows into signed PEAC interaction records
- See the [llms.txt](https://github.com/peacprotocol/peac/blob/main/llms.txt) for a concise protocol overview

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
