# Record MPP payment receipts as portable signed records

MPP handles the payment flow. PEAC records the resulting payment event as a portable signed `org.peacprotocol/payment` record verifiable without MPP server logs.

## Problem

The "Payment" HTTP authentication scheme (`draft-ryan-httpauth-payment-01`, an active individual Internet-Draft and work in progress, not a finalized standard, used by Machine Payments Protocol implementations) returns a `Payment-Receipt` header on a successful `200` after an HTTP `402` challenge. That receipt proves to the server that payment happened, but the core header is base64url JSON, not a portable PEAC-verifiable signed record: it cannot travel and be independently verified outside the server that issued it.

## What PEAC adds

PEAC observes the `Payment-Receipt` and issues a signed, portable `org.peacprotocol/payment` record. For a saved record and issuer JWKS, a counterparty verifies it offline with only the issuer public key:

```bash
peac verify ./payment-record.jws --public-key ./issuer-jwks.json
```

PEAC records and verifies. It does not settle, authorize, authenticate, or replace the payment protocol.

## Shape

- Record type: `org.peacprotocol/payment` (the type the `peac samples generate` payment-event sample uses).
- The registered `org.peacprotocol/commerce` extension carries the fields produced by `toCommerceExtensionFields()`: `payment_rail` (= `paymentauth`), `amount_minor`, `currency`, `reference`, and `env`. In this local demo `toCommerceExtensionFields()` supplies `env = live`; production integrations should assert environment from the upstream payment context.
- An integrator extension (the example uses `com.example/mpp`) carries observational overflow: `status`, `method`, `timestamp`, `challenge_id`, `resource`, `upstream_receipt_digest`, and `payment_challenge_digest`. Digest values are self-describing (`sha256:<hex>`).

This adds no new receipt type, extension group, wire change, schema change, or signing change.

## Redaction and binding

The raw `Payment-Receipt` is sensitive. The example binds it by digest and normalized fields; it does not log, store, or sign the raw header value. A counterparty re-binds the digest against the receipt it received to confirm they refer to the same payment, without the record ever carrying the raw credential material. The record binds the normalized 402 challenge identity (id, realm, method, intent, expires) and decoded request payload via `payment_challenge_digest`; amount and currency come from the challenge request, not from the `Payment-Receipt` header. The 402 challenge `request` fixture is JCS-serialized (RFC 8785) before base64url encoding, matching the draft's deterministic encoding requirement; the `Payment-Receipt` fixture remains base64url JSON.

## MCP coexistence

When the paid call is an MCP tool call, the PEAC receipt reference rides alongside the payment metadata in the same tool-result `_meta` tree, so a single response carries both the payment context and the portable signed record.

## Runnable example

See [`examples/mpp-payment-record/`](../../examples/mpp-payment-record/): a local, no-network demo that records a `Payment-Receipt`, verifies the record offline, demonstrates the `_meta` coexistence, and shows that tampering with the record fails verification (`E_INVALID_SIGNATURE`). It is the signed-record capstone on top of [`examples/paymentauth-evidence/`](../../examples/paymentauth-evidence/) (which is the parse + map example): it reuses the same `@peac/mappings-paymentauth` parser and `toCommerceExtensionFields()` mapper and introduces no new protocol surface.
