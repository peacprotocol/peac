# Counterparty acknowledgment records

**Outcome:** two independently signed, single-issuer PEAC records that a third party can bind together offline: a payer's payment record and a provider's record that acknowledges it.

**Audience:** developers recording a paid interaction where more than one party issues its own signed observation about the same payment.

**Time:** about 3 minutes.

## What this shows

- **Record P** - the payer issues a signed `org.peacprotocol/payment` record (commerce fields + a `org.peacprotocol/correlation` workflow id).
- **Record Q** - the provider issues its **own** signed `org.peacprotocol/payment` record that references P by the full identity triple `(acknowledged_iss, acknowledged_jti, acknowledged_record_ref)`, where `acknowledged_record_ref = sha256(P's compact JWS)` (DD-129). Q carries `correlation.parent_jti = P.jti` and `depends_on = [P.jti]`, plus an example-local `com.example/counterparty_acknowledgment` extension.

This is **not** a countersignature envelope and **not** two signatures over one payload; each record has exactly one issuer signature. PEAC does not countersign, arbitrate, or establish contractual agreement; an acknowledgment record reports only what the acknowledging party asserts.

Q is a provider-side **observation** of P's payment record, not a second payment: `acknowledging_role: "provider"` and `acknowledgment_scope: "payment-record-observed"` carry that meaning, and Q omits any settlement or finality field. Because `org.peacprotocol/payment` is bound to the `org.peacprotocol/commerce` extension group, Q mirrors P's minimum commerce identity fields (`payment_rail` / `amount_minor` / `currency` / `reference` / `env`) - describing the **same** acknowledged payment - and the linked verifier requires those mirrored fields to match P.

## Example-local extension

```json
"com.example/counterparty_acknowledgment": {
  "acknowledged_iss": "https://payer.example",
  "acknowledged_jti": "01H...",
  "acknowledged_record_ref": "sha256:<hex64 over P's compact JWS bytes>",
  "acknowledging_role": "provider",
  "acknowledgment_scope": "payment-record-observed"
}
```

`com.example/counterparty_acknowledgment` is a well-formed but **unregistered** example-local extension key (reverse-DNS form). It is preserved verbatim by verifiers and is not part of the PEAC registry.

## Run

```bash
pnpm --filter @peac/example-counterparty-acknowledgment-records demo
pnpm --filter @peac/example-counterparty-acknowledgment-records demo:tamper
```

## What the linked verifier checks (offline, public keys only)

1. P verifies offline.
2. Q verifies offline.
3. `sha256(P's JWS)` is recomputed and byte-compared to `acknowledged_record_ref`.
4. `acknowledged_iss` / `acknowledged_jti` match P's real `iss` / `jti` claims (misrepresentation guard).
5. `correlation.workflow_id` matches, `Q.parent_jti` equals `P.jti`, and `Q.depends_on` includes `P.jti`.
6. Q's mirrored `payment_rail` / `amount_minor` / `currency` / `reference` / `env` match P (commerce-field guard).

The link fails closed on any mismatch, and an absent acknowledgment extension reports "not linked" - never a false "acknowledged".

## Boundaries

PEAC records portable signed interaction records. It does not settle payments, gate access, arbitrate, establish contractual agreement, or assert delivery, fulfillment, or payment finality. This example carries only self-describing digests and identity claims; no raw sensitive material is embedded in a signed record.
