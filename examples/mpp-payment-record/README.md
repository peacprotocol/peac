# MPP Payment Record Example

MPP handles the payment flow. PEAC records the resulting payment event as a portable signed `org.peacprotocol/payment` record verifiable without MPP server logs.

This is a draft-aligned composition example for the "Payment" HTTP authentication scheme (`draft-ryan-httpauth-payment-01`, an active individual Internet-Draft and work in progress, not a finalized standard). It shows how a service that already speaks the HTTP 402 + `Payment-Receipt` flow can record each payment event as a portable, signed record that a customer, auditor, counterparty, or dispute system can verify offline, without access to the server's logs.

PEAC records and verifies. It does not settle, authorize, authenticate, or replace the payment protocol.

## Where this fits (no duplication)

This is the signed-record capstone on top of the existing paymentauth examples:

- [`paymentauth-jsonrpc`](../paymentauth-jsonrpc/) - paymentauth carried over a JSON-RPC transport.
- [`mpp-payment-attempt`](../mpp-payment-attempt/) - attempt/settlement evidence mapping (`fromMPPPaymentAttempt`/`fromMPPSettlement`).
- [`paymentauth-evidence`](../paymentauth-evidence/) - parse + **map** a 402 challenge and `Payment-Receipt` to PEAC evidence.
- **`mpp-payment-record` (this example)** - **sign** an `org.peacprotocol/payment` record, **verify it offline**, carry it in MCP `_meta`, and show tamper detection.

It reuses the same `@peac/mappings-paymentauth` parser and `toCommerceExtensionFields()` mapper as `paymentauth-evidence`; it adds only the sign, verify, and carry layer.

## What it shows

1. A server returns `402 Payment Required` with a "Payment" challenge for a paid resource (the price lives in the challenge).
2. The client pays; the server returns `200` with a `Payment-Receipt` header (base64url JSON).
3. PEAC observes the receipt and issues a signed `org.peacprotocol/payment` record:
   - the registered `org.peacprotocol/commerce` extension carries the fields produced by `toCommerceExtensionFields()` (`payment_rail = paymentauth`, `amount_minor`, `currency`, `reference`, `env`);
   - an example-local `com.example/mpp` extension carries observational overflow (`status`, `method`, `timestamp`, `challenge_id`, `resource`, `upstream_receipt_digest`, `payment_challenge_digest`); digest values are self-describing (`sha256:<hex>`).

   In this local demo `toCommerceExtensionFields()` supplies `env = live`; production integrations should assert environment from the upstream payment context.

4. The record is verified offline with only the issuer public key.
5. The same PEAC receipt reference coexists with payment metadata inside an MCP tool result `_meta` tree.
6. Tampering with the record payload fails verification (`E_INVALID_SIGNATURE`).

## Redaction and binding

The raw `Payment-Receipt` is sensitive. The example binds it by digest and normalized fields; it does not log, store, or sign the raw header value. The record binds the normalized 402 challenge identity (id, realm, method, intent, expires) and decoded request payload via `payment_challenge_digest`; amount and currency come from the challenge request, not from the `Payment-Receipt` header.

The 402 challenge `request` fixture is JCS-serialized (RFC 8785) before base64url encoding, matching the draft's deterministic encoding requirement; the `Payment-Receipt` fixture remains base64url JSON.

## Run

```bash
pnpm demo               # full flow: record, verify offline, MCP _meta coexistence
pnpm demo:tamper        # tamper check: a modified record fails the signature
pnpm demo:show-record   # print the decoded record header and payload
```

No network, no external services. This demo generates an ephemeral local keypair for repeatable local execution; production issuers should use stable issuer-controlled signing keys.

## Reused building blocks (no new protocol surface)

This example adds no new receipt type, extension group, schema, wire version, signing envelope, or package API. It composes existing packages:

- `@peac/mappings-paymentauth` - `parsePaymentauthChallenges`, `normalizeChallenge`, `parsePaymentauthReceipt`, `normalizeReceipt`, `toCommerceExtensionFields`
- `@peac/protocol` - `issue`, `verifyLocal`
- `@peac/schema` - `computeReceiptRef`
- `@peac/mappings-mcp` - `attachReceiptToMeta`, `extractReceiptFromMetaAsync`
- `@peac/crypto` - `generateKeypair`, `sha256Hex`, `jcsHash`
