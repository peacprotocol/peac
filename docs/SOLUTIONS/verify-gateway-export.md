# Verify gateway-export records

> **Outcome:** A payment gateway, facilitator, or settlement-recovery middleware observed a payment-submission, facilitator-timeout, or settlement-recovery event and emitted signed PEAC records. You want to verify those records offline as an auditor, counterparty, or downstream reviewer, without calling the gateway that produced them.
>
> **Audience:** Auditor / counterparty / downstream reviewer.
>
> **Time:** About 5 minutes from a clean clone, using the shipped fixtures.

## The problem

Payment gateways and facilitators already keep internal records of every settlement-recovery event. Those records are private to each gateway. When the facilitator times out, the upstream settlement state becomes visible through a separate system, the recovery loop polls, and the final outcome may not match the facilitator's last-known view. A reviewer outside the gateway has no portable way to verify the gateway's reported observations without trusting the gateway's read-only view of its own logs.

PEAC turns each observed event into a signed record using the canonical `org.peacprotocol/gateway-export` extension namespace and a `*-observed` type URI per event kind. Settlement, routing, on-chain verification, recovery policy, and dispute resolution remain upstream responsibilities. PEAC produces a portable, signed record of what the caller reported observing.

This recipe walks through verifying those records offline.

## What you'll use

PEAC packages:

- `@peac/protocol`: issuance and offline verification.
- `@peac/schema`: `validateGatewayExport` and the canonical extension key.
- `@peac/crypto`: Ed25519 signing.

Examples and fixtures:

- [`examples/gateway-export-records/`](../../examples/gateway-export-records/): generic, vendor-neutral demo with one fixture per `*-observed` event kind (8 total: 7 settlement/recovery state observations plus 1 facilitator-timeout trigger observation).

Prerequisites: Node 22+, pnpm 8+. No external service required.

## Step-by-step

1. Install dependencies and build the workspace.

   ```bash
   pnpm install
   pnpm build
   ```

2. Issue signed records from the generic fixtures. The script reads each fixture, validates the extension content through `validateGatewayExport`, signs an interaction record per fixture using the `commerce` pillar, and writes the records and the public key to `examples/gateway-export-records/out/`.

   ```bash
   cd examples/gateway-export-records
   pnpm issue
   ```

   You should see one `[OK]` line per `*-observed` event kind.

3. Verify the records offline. The verifier loads the public key plus the signed records and runs `verifyLocal` for each. The private key is not required.

   ```bash
   pnpm verify
   ```

   Each record prints `[OK]`; the summary reports `Verified <count>/<count>`.

4. (Optional) Verify the records through a reference verifier deployment. The reference verifier in [`surfaces/reference-verifier/`](../../surfaces/reference-verifier/) includes local and edge-deployment recipes. Each deployment runs the same offline verification. Treat the deployment as informative; the protocol behavior is the same as the local `verifyLocal` call in step 3.

## When to use this

- An auditor needs to verify signed records reporting that a payment was submitted, a facilitator timeout occurred, recovery polling ran, or a settlement state was observed, without calling the gateway's API.
- A counterparty needs portable evidence of a settlement-confirmed-late or settlement-failed-orphaned outcome (the two failure-edge cases that are easy to miss in a private log).
- A reviewer needs offline evidence that a timeout-trigger event was reported. The record does not by itself prove that recovery began.
- A reconciliation system needs to bind PEAC records to its own ledger using the canonical EIP-3009 four-tuple references (`payer_ref`, `pay_to_ref`, `nonce_ref`) plus `amount_minor`.

## Expected failure modes

`validateGatewayExport` rejects with stable error codes:

- `gateway.export.invalid_payload`: the top-level payload was not a JSON object (null, undefined, array, or primitive).
- `gateway.export.inline_payment_data_blocked`: a forbidden top-level payment-data key (transaction_data, raw_tx, raw_nonce, payer, pay_to, payTo, payment_payload, authorization, card_number, pan, cvv, token, bearer_token, api_key, private_key, credential, etc.) was present at the extension top level.
- `gateway.export.unknown_field`: an unrecognized top-level key was present. Includes `value_minor`: it is intentionally not a schema field; the single canonical money field is `amount_minor`.
- `gateway.export.opaque_ref_grammar_violation` / `gateway.export.ref_must_be_string`: `*_ref` field grammar or type mismatch.
- `gateway.export.missing_required_field`: `event_kind`, `gateway_ref`, `payment_ref`, `observed_at`, a per-kind required field, or (when `timeout_profile = 'custom'`) any of `facilitator_timeout_ms` / `poll_interval_ms` / `max_poll_window_ms` was absent.
- `gateway.export.invalid_event_kind`: the `event_kind` value was not one of the eight recognized kinds.
- `gateway.export.invalid_amount_minor`: `amount_minor` failed the shared `AmountMinorStringSchema` grammar or the Gateway Export non-negative profile constraint (numeric, decimal, comma-formatted, empty, or negative values reject).
- `gateway.export.invalid_timeout_profile`: `timeout_profile` was not one of `datacenter` / `east_africa_3g` / `west_africa_3g` / `custom`.
- `gateway.export.invalid_polling_strategy`: `polling_strategy` was not one of `exponential` / `linear` / `immediate` / `webhook` / `unknown`.
- `gateway.export.invalid_poll_count` / `invalid_check_count`: count exceeded `0..1_000_000` or was non-integer / unsafe.
- `gateway.export.invalid_deadline_exceeded_ms` / `invalid_delay_ms` / `invalid_facilitator_timeout_ms` / `invalid_poll_interval_ms` / `invalid_max_poll_window_ms`: millisecond value exceeded `0..2_592_000_000` (30 days) or was non-integer / unsafe.
- `gateway.export.invalid_valid_before_unix_seconds`: `valid_before_unix_seconds` was negative, non-integer, or above `Number.MAX_SAFE_INTEGER`.
- `gateway.export.field_too_large`: `asset`, `network`, `final_state`, or `last_known_state` exceeded its UTF-8 byte limit (32 / 64 / 64 / 64 bytes respectively; counted by `TextEncoder().encode().byteLength`, not by JavaScript code units).
- `gateway.export.invalid_digest`: `upstream_artifact_digest` failed the sha256-hex grammar.
- `gateway.export.type_event_kind_mismatch` / `type_uri_unknown`: when using `validateGatewayExportForType`, the wire-record `type` URI does not match the `event_kind` value or is not in the recognized set of eight gateway-export type URIs.

`verifyLocal` rejects when the signature does not verify against the supplied public key.

## Privacy and security notes

- Fixture data is synthetic. Real records will carry caller-controlled gateway, payment, and (optionally) EIP-3009 four-tuple identifiers; treat them as PII unless your operator policy says otherwise.
- Raw transaction data, raw nonces, raw EIP-3009 four-tuple addresses (`payer`, `pay_to`, `payTo`), payment payloads, authorization payloads, and credential material are forbidden at the extension top level. Use opaque references (`tx_ref`, `nonce_ref`, `payer_ref`, `pay_to_ref`, etc.) and an `upstream_artifact_digest` (sha256-hex) to bind the record to the upstream artifact without copying its contents.
- The single-canonical-money-field invariant rejects `value_minor` and any other money-shaped key besides `amount_minor`. When the EIP-3009 four-tuple references are present, `amount_minor` represents the four-tuple value component.
- Timeout-profile labels (`datacenter`, `east_africa_3g`, `west_africa_3g`, `custom`) are caller-reported. PEAC does not infer geography, network quality, settlement finality, or settlement guarantees from these labels.

## Boundary

PEAC records what the caller reports. PEAC does not settle transactions, route payments, contact gateways, verify on-chain state, monitor settlements, enforce recovery policy, compute payment finality, or resolve settlement disputes. Recovery decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

### Trigger vs state

The eight type URIs split into a 7-state settlement/recovery model plus one PEAC timeout-trigger observation:

- Seven URIs (`gateway-payment-submitted-observed`, `gateway-settlement-unresolved-observed`, `gateway-settlement-polling-observed`, `gateway-settlement-confirmed-observed`, `gateway-settlement-confirmed-late-observed`, `gateway-settlement-failed-observed`, `gateway-settlement-failed-orphaned-observed`) correspond to observed settlement/recovery states.
- One URI (`gateway-facilitator-timeout-observed`) records the facilitator-timeout trigger event itself.

PEAC does not introduce an additional settlement state. A reviewer reading a `gateway-facilitator-timeout-observed` record sees a discrete observable boundary signal that may precede unresolved recovery; the record does not by itself claim that recovery began.

## Related

- Profile spec: [`docs/specs/GATEWAY-EXPORT-RECORDS.md`](../specs/GATEWAY-EXPORT-RECORDS.md)
- Generic example: [`examples/gateway-export-records/`](../../examples/gateway-export-records/)
- Parity corpus: [`specs/conformance/parity-corpus/gateway-export/`](../../specs/conformance/parity-corpus/gateway-export/)
