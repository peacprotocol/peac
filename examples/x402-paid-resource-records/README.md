# x402 Paid Resource Records

**Outcome:** a portable, offline-verifiable `org.peacprotocol/payment` record for a settled x402 offer/receipt pair, works behind any gateway or CDN that fronts x402.

**Audience:** teams charging for access to an API or MCP tool behind x402 who need evidence of what settled that survives independently of their own logs.

**Time:** 5 minutes.

A resource server behind x402 challenges payment for a resource with a signed offer and, once payment settles, returns a signed receipt (the "Signed Offers and Receipts" extension, upstream `x402-foundation/x402` commit `f2bbb5c`, `extensions["offer-receipt"]`). `@peac/adapter-x402` verifies the offer against accept terms and checks offer/receipt consistency, but does not itself produce a portable, independently verifiable record of what settled.

This example composes that record: PEAC observes the settled offer/receipt pair and issues a signed `org.peacprotocol/payment` record that a customer, auditor, counterparty, or dispute system can verify offline, with only the issuer public key.

PEAC records and verifies. It does not settle, price, or gate access, and it does not verify x402 scheme-specific invariants (single-use, time bounds, recipient/facilitator binding, on-chain finality); see [`docs/compatibility/x402-scheme-coverage.md`](../../docs/compatibility/x402-scheme-coverage.md) for that boundary.

## Where this fits (no duplication)

- [`x402-weather-proof`](../x402-weather-proof/) - the offer/receipt verification walkthrough (term-matching, consistency, unsigned evidence mapping via `toPeacRecord`).
- [`x402-upto-evidence`](../x402-upto-evidence/) - settlement-proof extraction from response headers, mapped to unsigned commerce evidence.
- **`x402-paid-resource-records` (this example)** - the signed-record composition example: **sign** an `org.peacprotocol/payment` record from a settled offer/receipt pair, **verify it offline**, and detect both a signature tamper and a settlement-receipt digest mismatch.

It reuses `@peac/adapter-x402`'s existing verification and mapping functions (`extractExtensionInfo`, `verifyOffer`, `verifyOfferReceiptConsistency`, `extractSettlementProofFromHeaders`, `extractSignedReceiptFromSettlement`, `toPeacRecord`) rather than re-implementing offer/receipt handling.

## What it shows

1. A resource server returns a 402 challenge carrying a signed x402 offer (`extensions["offer-receipt"].info.offers`).
2. The client pays; the settlement is observed via **both** channels a real deployment might expose: the `PAYMENT-RESPONSE` response header (`extractSettlementProofFromHeaders`) and the offer-receipt extension body (`extractSignedReceiptFromSettlement`, the settlement-extensions body path). The demo checks the two channels report the same artifact (dual-channel consistency); if they disagree, the record is never issued (fail closed).
3. `verifyOffer` and `verifyOfferReceiptConsistency` confirm the offer matches the accepted terms and the receipt is consistent with the offer (same resource, same network, issued within the offer's validity window).
4. PEAC issues a signed `org.peacprotocol/payment` record:
   - the registered `org.peacprotocol/commerce` extension carries `payment_rail = x402`, `amount_minor`, `currency`, `asset`, `reference` (the on-chain transaction reference), `env`, `event = settlement`;
   - an example-local `com.example/paid_resource` extension carries `network` and `scheme` (x402 concepts with no home in `org.peacprotocol/commerce`, which is `.strict()` and has no `network` field) plus five digests: `offer_terms_digest` (an RFC 8785 JCS digest of the normalized offer terms), `signed_offer_artifact_digest` and `signed_receipt_artifact_digest` (digests of the signed offer/receipt artifacts themselves, via `computeJsonDocumentDigestJcs`), `settlement_header_digest` (a digest over the header-observed proof's `source` and `raw_value`, never the raw header value itself), and `settlement_receipt_payload_digest` (a digest of the normalized settlement receipt payload), plus `upstream_artifact_digest` (equal to `signed_receipt_artifact_digest`, binding the settlement receipt artifact this record was derived from, mirroring the naming already used by `org.peacprotocol/agent-action`'s `upstream_artifact_digest` field).
5. The record is verified offline with only the issuer public key. The counterparty independently re-derives the offer terms, the signed offer/receipt artifacts, the header-observed proof, and the settlement receipt payload from the same raw materials it separately received, and confirms every digest still matches what is bound in the record; it does not just trust the issuer's arithmetic.
6. Two independent tamper checks: altering the settlement receipt content after digesting breaks the digest re-bind (signature still verifies); tampering with the signed record payload breaks the signature (`E_INVALID_SIGNATURE`).

## Redaction and binding

The raw signed offer/receipt JWS artifacts and the raw `PAYMENT-RESPONSE` header value are upstream x402 material. The record binds them by digest; it never inlines the raw artifacts, the raw header value, or the unsigned `toPeacRecord()` evidence mapping (which does preserve the raw artifacts, for local audit use) into the signed payload.

## Non-goals

- Not a payment rail: PEAC does not move funds or decide pricing.
- Not a gate: PEAC does not decide whether to grant access to the resource.
- Not a scheme verifier: single-use, time-bound, and recipient/facilitator-binding invariants remain the facilitator's and the upstream x402 scheme's responsibility.

## Run

```bash
pnpm install
pnpm --filter @peac/example-x402-paid-resource-records demo           # full flow
pnpm --filter @peac/example-x402-paid-resource-records demo:tamper    # tamper checks
```

No network, no external services. This demo generates two ephemeral local keypairs: one simulating the x402 facilitator's signing key (for the offer/receipt JWS artifacts) and one for the PEAC record issuer. Production issuers should use stable issuer-controlled signing keys.

## Reused building blocks (no new protocol surface)

This example adds no new receipt type, extension group, schema field, wire version, signing envelope, or package API. It composes existing packages:

- `@peac/adapter-x402` - `extractExtensionInfo`, `verifyOffer`, `verifyOfferReceiptConsistency`, `extractSettlementProofFromHeaders`, `extractSignedReceiptFromSettlement`, `toPeacRecord`, `normalizeOfferPayload`, `normalizeReceiptPayload`, `extractOfferPayload`, `extractReceiptPayload`, `OFFER_RECEIPT`, `MAX_SETTLEMENT_EXTENSIONS_BYTES`
- `@peac/protocol` - `issue`, `verifyLocal`, `computeJsonDocumentDigestJcs`
- `@peac/crypto` - `generateKeypair`, `sign`
- `@peac/schema` - `computeReceiptRef`
