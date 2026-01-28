# @peac/adapter-x402

x402 offer/receipt verification, term-matching, and PEAC record mapping.

## Overview

This package verifies x402 extension objects (offers and receipts) and maps
them into canonical PEAC interaction records. It implements the term-matching
verification strategy where `acceptIndex` is treated as an untrusted hint
and the binding comes from matching signed payload fields against accept
terms.

## Install

```bash
pnpm add @peac/adapter-x402
```

## Usage

### Verify an offer against accept terms

```typescript
import { verifyOffer } from '@peac/adapter-x402';

const result = verifyOffer(signedOffer, acceptEntries, acceptIndex);

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

// With hint (bounds-check + term-match)
const match = selectAccept(offerPayload, accepts, acceptIndex);

// Without hint (scan for unique match)
const match = selectAccept(offerPayload, accepts);
```

### Map to PEAC record

```typescript
import { toPeacRecord } from '@peac/adapter-x402';

const record = toPeacRecord(paymentRequired, settlementResponse);
// record.proofs.x402.offer   -- raw offer preserved for audit
// record.proofs.x402.receipt  -- raw receipt preserved for audit
// record.evidence.txHash      -- from signed receipt payload
// record.hints.acceptIndex    -- { value: 0, untrusted: true }
```

## acceptIndex: hint-only semantics

Per x402 PR #935, `acceptIndex` is an unsigned envelope field outside the
signed payload. Verifiers MUST NOT rely on it as a binding mechanism.

This package treats `acceptIndex` as advisory:

- If present: bounds-check, then term-match `accepts[acceptIndex]` against
  the signed payload. Reject on mismatch.
- If absent: scan all `accepts[]` entries for a unique match. If ambiguous
  (multiple matches), reject.
- If tampered: does not affect security because the binding comes from
  comparing signed payload fields, not the unsigned index.

## API

### `verifyOffer(offer, accepts, acceptIndex?, config?)`

Verify a signed offer against accept terms. Checks structure, expiry,
version, signature format, and term-matching.

### `verifyReceipt(receipt, config?)`

Verify a signed receipt's structure and version.

### `matchAcceptTerms(payload, accept)`

Compare offer payload fields against a single accept entry. Returns an
array of mismatched field names (empty means match).

### `selectAccept(payload, accepts, acceptIndex?)`

Select the matching accept entry. Throws `X402Error` on failure.

### `toPeacRecord(paymentRequired, settlementResponse)`

Map an x402 payment flow to a PEAC interaction record.

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

Built by [Originary](https://originary.co) and contributors to the
[PEAC Protocol](https://www.peacprotocol.org).
