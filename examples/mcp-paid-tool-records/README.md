# MCP Paid Tool Records

**Outcome:** a portable, offline-verifiable `org.peacprotocol/payment` record that binds a specific MCP tool call (name, a digest of its arguments, and a digest of its result) to the x402 settlement that paid for it, carried directly in the tool result's `_meta`.

**Audience:** MCP tool authors and integrators who charge for individual tool calls via x402 and need evidence of which call a settlement paid for, portable outside their own server.

**Time:** 5 minutes.

A priced MCP tool call triggers an x402 payment challenge; once the caller pays, the settlement is observed via the "Signed Offers and Receipts" extension (upstream `x402-foundation/x402` commit `f2bbb5c`, `extensions["offer-receipt"]`, body path via `extractSignedReceiptFromSettlement`). This example binds that settlement to the specific tool call it paid for: the tool name, a digest of the tool call arguments (never the raw arguments), and a digest of the returned tool result (never the raw result) are bound into a signed `org.peacprotocol/payment` record, carried in the MCP tool result's `_meta`, and verified offline directly from that `_meta` carrier.

Before issuing the record, the offer is verified against the accepted payment terms and the receipt is checked for consistency with the offer (`verifyOffer` / `verifyOfferReceiptConsistency`, reused from `@peac/adapter-x402`); a mismatched offer or receipt refuses issuance.

## Where this fits (no duplication)

- [`x402-paid-resource-records`](../x402-paid-resource-records/) - the general signed-record composition example for a settled x402 offer/receipt pair, with full offer term-matching, offer/receipt consistency, and dual-channel (header + body) settlement observation.
- [`mcp-gateway-receipts`](../mcp-gateway-receipts/) - **gateway-side**: a gateway signs policy decisions (allow/deny) for a whole fleet of tools, independent of payment.
- **`mcp-paid-tool-records` (this example)** - **tool-call-side composition**: the record is issued by (or on behalf of) the one specific paid tool, at the point that tool call completes, binding the tool call itself (name + argument digest + result digest) to its settlement. Not gateway mediation, and not the general x402 record-composition example: it is the narrower "this exact call, this exact settlement" binding.

## What it shows

1. A priced tool call (`market_data.premium_quote`) triggers an x402 challenge (a signed offer, `extensions["offer-receipt"].info.offers`). Only the tool name and a digest of the arguments are ever logged, never the raw arguments.
2. The caller pays; the settlement is observed via the offer-receipt extension body (`extractSignedReceiptFromSettlement`). `verifyOffer` confirms the offer matches the accepted payment terms and `verifyOfferReceiptConsistency` confirms the receipt is consistent with the offer (same resource, same network, issued within the offer's validity window); either check failing refuses issuance. Issuance also refuses to proceed on offer-only data (no observed settlement artifact).
3. PEAC issues a signed `org.peacprotocol/payment` record:
   - the registered `org.peacprotocol/commerce` extension carries `payment_rail = x402`, `amount_minor`, `currency`, `asset`, `reference` (the on-chain transaction reference), `env`, `event = settlement`;
   - an example-local `com.example/mcp_paid_tool` extension binds `tool_name`, `tool_args_digest` (an RFC 8785 JCS digest of the tool call arguments via `computeJsonDocumentDigestJcs`, never the raw arguments), and `tool_result_digest` (a digest of the returned tool result's `content`/`structuredContent`, never the raw result), plus three receipt digests that distinguish the signed artifact from the normalized payload (mirroring the x402 paid-resource example):
     - `signed_receipt_artifact_digest`: digest of the signed upstream receipt artifact (the `RawSignedReceipt` observed in the settlement).
     - `settlement_receipt_payload_digest`: digest of the normalized receipt payload (field-level audit, not the artifact identity).
     - `upstream_artifact_digest`: equal to `signed_receipt_artifact_digest` (the signed artifact is the upstream artifact this call paid for, mirroring `org.peacprotocol/agent-action`'s `upstream_artifact_digest` field).
4. The record is attached to the MCP tool result via the top-level `_meta` carrier keys (`org.peacprotocol/receipt_ref`, `org.peacprotocol/receipt_jws`), the same carrier contract `mcp-gateway-receipts` and `mpp-payment-record` use.
5. Verification reads the record back out of `_meta` (not from a value the demo already had in hand) and verifies it offline with only the issuer public key. The counterparty independently re-derives the tool-args digest, the tool-result digest, and the settlement-receipt digest from the same raw materials it separately received, and confirms they still match what is bound in the record.
6. Two independent tamper checks: altering the returned tool result after signing breaks the tool-result digest re-bind (signature still verifies); tampering with the `_meta`-carried record payload fails verification (`E_INVALID_SIGNATURE`).

## Redaction and binding

The tool call arguments, the returned tool result, and the raw settlement receipt JWS artifact are never inlined into the signed record or into `_meta`: only their sha256 digests are bound. The `_meta` carrier legitimately contains the PEAC receipt JWS itself (`org.peacprotocol/receipt_jws`) by design; that is the record being carried, not a leak.

## Non-goals

- Not a payment rail: PEAC does not move funds or decide pricing.
- Not a gate: PEAC does not decide whether to run the tool or return its result.
- Not a scheme verifier: x402 scheme-specific invariants remain the facilitator's and the upstream x402 scheme's responsibility; see [`docs/compatibility/x402-scheme-coverage.md`](../../docs/compatibility/x402-scheme-coverage.md).

## Run

```bash
pnpm install
pnpm --filter @peac/example-mcp-paid-tool-records demo           # full flow
pnpm --filter @peac/example-mcp-paid-tool-records demo:tamper    # tamper checks
```

No network, no external services. This demo generates two ephemeral local keypairs: one simulating the x402 facilitator's signing key (for the offer/receipt JWS artifacts) and one for the PEAC record issuer.

## Reused building blocks (no new protocol surface)

This example adds no new receipt type, extension group, schema field, wire version, signing envelope, or package API. It composes existing packages:

- `@peac/adapter-x402` - `extractExtensionInfo`, `verifyOffer`, `verifyOfferReceiptConsistency`, `extractOfferPayload`, `normalizeOfferPayload`, `extractSignedReceiptFromSettlement`, `extractReceiptPayload`, `normalizeReceiptPayload`
- `@peac/protocol` - `issue`, `verifyLocal`, `computeJsonDocumentDigestJcs`
- `@peac/mappings-mcp` - `attachReceiptToMeta`, `extractReceiptFromMetaAsync`
- `@peac/crypto` - `generateKeypair`, `sign`
- `@peac/schema` - `computeReceiptRef`
