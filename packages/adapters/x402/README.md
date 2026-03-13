# @peac/adapter-x402

Verification, term-matching, and evidence mapping for the x402
Offer/Receipt extension (compatible with upstream coinbase/x402).

## Overview

This package verifies x402 extension artifacts (offers and receipts) and maps
them into canonical PEAC interaction records. It implements term-matching
verification where `acceptIndex` is treated as an untrusted hint and the
binding comes from matching signed payload fields against accept terms.

Compatible with upstream x402 Offer/Receipt extension wire shapes. Defaults
match upstream behavior; stricter verification is available via opt-in
configuration.

## Install

```bash
pnpm add @peac/adapter-x402
```

## Usage

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

### Select accept entry with term-matching

```typescript
import { selectAccept } from '@peac/adapter-x402';

// With hint (bounds-check + term-match via offer.acceptIndex)
const match = selectAccept(offerPayload, accepts, offer.acceptIndex);

// Without hint (scan for unique match)
const match = selectAccept(offerPayload, accepts);
```

### Map to PEAC record

```typescript
import { toPeacRecord } from '@peac/adapter-x402';

const record = toPeacRecord(challenge, settlementResponse);
// record.proofs.x402.offer    -- raw offer preserved for audit
// record.proofs.x402.receipt   -- raw receipt preserved for audit
// record.evidence.resourceUrl  -- from signed offer payload
// record.evidence.payer        -- from signed receipt payload
// record.evidence.transaction  -- optional, from receipt (privacy-minimal)
// record.hints.acceptIndex     -- { value: 0, untrusted: true }
```

### Extract from upstream wire format

```typescript
import { extractExtensionInfo, extractReceiptFromHeaders } from '@peac/adapter-x402';

// Extract offers from upstream 402 response body
const info = extractExtensionInfo(responseBody);
// info.offers: RawSignedOffer[]
// info.receipt?: RawSignedReceipt

// Extract receipt from settlement response headers
const receipt = extractReceiptFromHeaders(responseHeaders);
```

## acceptIndex: hint-only semantics

In the x402 Offer/Receipt extension, `acceptIndex` is an unsigned per-offer
field outside the signed payload. Verifiers MUST NOT rely on it as a binding
mechanism.

This package treats `acceptIndex` as advisory:

- If present: bounds-check, then term-match `accepts[acceptIndex]` against
  the signed payload. Reject on mismatch.
- If absent: scan all `accepts[]` entries for a unique match. If ambiguous
  (multiple matches), reject.
- If tampered: does not affect security because the binding comes from
  comparing signed payload fields, not the unsigned index.

## API

### `verifyOffer(offer, accepts, config?)`

Verify a signed offer against accept terms. Checks structure, expiry,
version, signature format, and term-matching.

### `verifyReceipt(receipt, config?)`

Verify a signed receipt's required fields, version, payer format, and
issuedAt recency.

### `verifyOfferReceiptConsistency(offerPayload, receiptPayload, config?, options?)`

Verify consistency between an offer and a receipt (resourceUrl, network,
issuedAt freshness, optional payer candidate matching).

### `matchAcceptTerms(payload, accept, addressComparator?)`

Compare offer payload fields against a single accept entry. Returns an
array of mismatched field names (empty means match).

### `selectAccept(payload, accepts, acceptIndex?, addressComparator?)`

Select the matching accept entry. Throws `X402Error` on failure.

### `toPeacRecord(challenge, settlementResponse, options?)`

Map an x402 payment flow to a PEAC interaction record.

## x402 Version Support

This adapter supports x402 **Offer/Receipt extension version 1** (default).

| Component               | Versions     | Details                                                   |
| ----------------------- | ------------ | --------------------------------------------------------- |
| Offer/Receipt extension | v1 (default) | Configurable via `supportedVersions` option               |
| HTTP header dialect     | v1 + v2      | Auto-detected by `@peac/rails-x402` via `detectDialect()` |

The version is configurable per call:

```typescript
const result = verifyOffer(offer, accepts, {
  supportedVersions: [1, 2],
});
```

The adapter defines its own x402 types (no external x402 npm dependencies).

## Error handling

All verification functions return structured results with error arrays.
The `selectAccept` and `toPeacRecord` functions throw `X402Error` with:

- `code`: Machine-readable error code (lowercase snake_case)
- `httpStatus`: Suggested HTTP status code
- `field`: Optional field that caused the error
- `details`: Optional structured details

## License

Apache-2.0

---

PEAC Protocol is an open source project stewarded by Originary and community contributors.

[Docs](https://www.peacprotocol.org) | [GitHub](https://github.com/peacprotocol/peac) | [Originary](https://www.originary.xyz)
