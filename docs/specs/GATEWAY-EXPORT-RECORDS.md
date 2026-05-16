# Gateway Export Records Profile

**Profile version:** 0.1
**Extension namespace:** `org.peacprotocol/gateway-export`
**Scope:** OBSERVER - records caller-reported observations of payment-gateway / facilitator settlement-recovery events
**Introduced in:** v0.14.3
**Conformance section:** 34 (GATE-EXP-001..GATE-EXP-010)

---

## 1. Overview

Gateway Export Records provide a portable signed record of caller-reported payment-gateway / facilitator settlement-recovery events. The caller observed the event; the caller's issuer signs and issues the record. PEAC provides the record format, validation, and signing path.

**PEAC does not settle transactions, route payments, contact gateways, verify on-chain state, monitor settlements, enforce recovery policy, or resolve settlement disputes.** Recovery decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

The record creates portable, verifiable evidence of gateway settlement-recovery events that can be verified outside the system that produced it.

### Trigger-vs-state doctrine (NORMATIVE)

Gateway Export Records define 8 PEAC receipt-type URIs. Seven correspond to observed settlement/recovery states: `pending`, `confirmed`, `unresolved`, `polling`, `confirmed_late`, `failed`, and `failed_orphaned`. One URI, `gateway-facilitator-timeout-observed`, records the facilitator-timeout trigger event itself. **PEAC does not introduce a new settlement state**; it records an observable gateway boundary signal that may precede unresolved recovery.

This profile follows a 7-state settlement/recovery model plus one PEAC timeout-trigger observation. Upstream payment-facilitator settlement-recovery designs are cited as informative references; PEAC schema names, error codes, type URIs, and normative text remain PEAC-neutral. PEAC is the records layer beneath runtime governance; it composes with payment-facilitator middleware without depending on or governing any specific implementation.

### Normative keywords

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capital letters.

---

## 2. Extension Group Registration

| Field               | Value                             |
| ------------------- | --------------------------------- |
| Extension namespace | `org.peacprotocol/gateway-export` |
| `extensions` key    | `org.peacprotocol/gateway-export` |
| Status              | informational                     |

---

## 3. Type URIs

Eight type URIs. Seven correspond 1:1 with observed settlement/recovery states; one records the facilitator-timeout trigger event itself.

| Type URI                                                       | Event kind                                    | Pillar   | Maps to                                                                     |
| -------------------------------------------------------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `org.peacprotocol/gateway-payment-submitted-observed`          | `gateway-payment-submitted-observed`          | commerce | settlement/recovery state `pending`                                         |
| `org.peacprotocol/gateway-facilitator-timeout-observed`        | `gateway-facilitator-timeout-observed`        | commerce | **TRIGGER** for `unresolved` (not a settlement state; boundary observation) |
| `org.peacprotocol/gateway-settlement-unresolved-observed`      | `gateway-settlement-unresolved-observed`      | commerce | settlement/recovery state `unresolved`                                      |
| `org.peacprotocol/gateway-settlement-polling-observed`         | `gateway-settlement-polling-observed`         | commerce | settlement/recovery state `polling`                                         |
| `org.peacprotocol/gateway-settlement-confirmed-observed`       | `gateway-settlement-confirmed-observed`       | commerce | settlement/recovery state `confirmed`                                       |
| `org.peacprotocol/gateway-settlement-confirmed-late-observed`  | `gateway-settlement-confirmed-late-observed`  | commerce | settlement/recovery state `confirmed_late`                                  |
| `org.peacprotocol/gateway-settlement-failed-observed`          | `gateway-settlement-failed-observed`          | commerce | settlement/recovery state `failed`                                          |
| `org.peacprotocol/gateway-settlement-failed-orphaned-observed` | `gateway-settlement-failed-orphaned-observed` | commerce | settlement/recovery state `failed_orphaned`                                 |

The type URI in the PEAC record envelope (`type` field) MUST match the `event_kind` in the extension body (drop the `org.peacprotocol/` prefix to get `event_kind`).

Profile boundary rules:

- This profile is a 7-state settlement/recovery model plus one PEAC timeout-trigger observation. It is not an 8-state settlement state machine.
- The `gateway-facilitator-timeout-observed` URI is documented explicitly as a trigger event, not a settlement state.
- This profile registers only the eight Gateway Export type URIs listed above. Generic gateway request, response, error, retry, rate-limit, auth, and batch boundary records are outside this profile.

---

## 4. Schema

### 4.1 Common required fields (all event kinds)

| Field         | Type               | Description                                                           |
| ------------- | ------------------ | --------------------------------------------------------------------- |
| `event_kind`  | string (enum)      | Discriminator; one of the eight values above                          |
| `gateway_ref` | OpaqueRef          | Reference to the gateway / facilitator endpoint                       |
| `payment_ref` | OpaqueRef          | Reference to the payment being tracked                                |
| `observed_at` | RFC 3339 timestamp | When the caller observed the event (timezone offset MUST be explicit) |

### 4.2 Common optional fields (all event kinds)

| Field                       | Type              | Description                                                                                                                                                                   |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facilitator_ref`           | OpaqueRef         | Facilitator-specific identifier                                                                                                                                               |
| `amount_minor`              | AmountMinorString | Bounded non-negative base-10 integer string. Single canonical money field; carries EIP-3009 `value` component when four-tuple refs are present                                |
| `asset`                     | string            | Bounded asset identifier (max 32 UTF-8 bytes)                                                                                                                                 |
| `network`                   | string            | Bounded network identifier (max 64 UTF-8 bytes)                                                                                                                               |
| `tx_ref`                    | OpaqueRef         | Transaction / on-chain reference                                                                                                                                              |
| `nonce_ref`                 | OpaqueRef         | Idempotency nonce reference (also the EIP-3009 four-tuple `nonce` component when present)                                                                                     |
| `upstream_artifact_ref`     | OpaqueRef         | Reference to an upstream artifact (gateway log, facilitator response)                                                                                                         |
| `upstream_artifact_digest`  | sha256-hex        | Digest of an upstream artifact                                                                                                                                                |
| `caller_ref`                | OpaqueRef         | Who reported the event                                                                                                                                                        |
| `parent_ref`                | OpaqueRef         | Parent event (e.g., the payment-submitted event that preceded this state)                                                                                                     |
| `valid_before_unix_seconds` | non-negative int  | Caller-reported EIP-3009 `validBefore` expiry in Unix seconds. PEAC records the caller-reported expiry; PEAC does NOT verify EIP-3009 validity. Natural state-expiry boundary |
| `payer_ref`                 | OpaqueRef         | Caller-reported EIP-3009 four-tuple `payer` reference                                                                                                                         |
| `pay_to_ref`                | OpaqueRef         | Caller-reported EIP-3009 four-tuple `payTo` reference                                                                                                                         |

### 4.3 Per-event-kind additional fields

| Event kind                                       | Additional required                                                        | Additional optional                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateway-payment-submitted-observed`             | `submitted_at` (RFC 3339)                                                  | `timeout_deadline` (RFC 3339)                                                                                                                     |
| `gateway-facilitator-timeout-observed` (TRIGGER) | `timeout_at` (RFC 3339), `timeout_profile`                                 | `deadline_exceeded_ms`, `facilitator_timeout_ms` / `poll_interval_ms` / `max_poll_window_ms` (ALL THREE REQUIRED when `timeout_profile='custom'`) |
| `gateway-settlement-unresolved-observed`         | `last_checked_at` (RFC 3339), `check_count` (0..1_000_000)                 | (none)                                                                                                                                            |
| `gateway-settlement-polling-observed`            | `poll_count` (0..1_000_000), `polling_strategy`                            | (none)                                                                                                                                            |
| `gateway-settlement-confirmed-observed`          | `confirmed_at` (RFC 3339), `settlement_ref`                                | (none)                                                                                                                                            |
| `gateway-settlement-confirmed-late-observed`     | `confirmed_at` (RFC 3339), `settlement_ref`, `delay_ms` (0..2_592_000_000) | (none)                                                                                                                                            |
| `gateway-settlement-failed-observed`             | `final_state` (bounded short label; max 64 UTF-8 bytes)                    | `failure_reason_ref`                                                                                                                              |
| `gateway-settlement-failed-orphaned-observed`    | `last_known_state` (bounded short label; max 64 UTF-8 bytes)               | `chain_ref`                                                                                                                                       |

---

## 5. Opaque Reference Grammar

All `*_ref` fields follow the shared `OpaqueRefSchema` grammar:

- Recognized prefixes: `ref:`, `urn:`, `did:`, `sha256:`, `peac:`, `https:`
- Maximum 256 UTF-8 bytes
- No whitespace, no `@`, no JSON-opening characters
- Numeric-only strings reject (no recognized prefix)
- Email-shaped strings reject (`@` character blocked)

The fields under this grammar are: `gateway_ref`, `payment_ref`, `facilitator_ref`, `tx_ref`, `nonce_ref`, `upstream_artifact_ref`, `caller_ref`, `parent_ref`, `payer_ref`, `pay_to_ref`, `settlement_ref`, `failure_reason_ref`, `chain_ref`.

---

## 6. Timeout-Profile Doctrine (NORMATIVE)

**GATE-EXP-007 (MUST):** `timeout_profile` is a closed enum aligned with upstream environment profiles.

```text
datacenter
east_africa_3g
west_africa_3g
custom
```

**Caller-reported labels:** `timeout_profile` values are caller-reported profile labels. PEAC does NOT infer geography, network quality, settlement finality, or settlement guarantees from these labels. The geographic-sounding labels (`east_africa_3g`, `west_africa_3g`) are upstream-aligned identifiers, not geographic claims; PEAC records what the caller reported, not where the call originated.

**Custom timing requirement (MUST):** When `timeout_profile = 'custom'`, the record MUST include all three of `facilitator_timeout_ms`, `poll_interval_ms`, and `max_poll_window_ms`. Each is a non-negative safe integer bounded to 0..2_592_000_000 (30 days). Missing any required timing field rejects with `gateway.export.missing_required_field`. Non-custom profiles MAY include these timing fields as caller-reported evidence but are NOT required to.

---

## 7. Polling-Strategy Doctrine (INFORMATIVE)

`polling_strategy` is a PEAC-defined OBSERVER-scope categorical descriptor of caller-reported polling behavior. It is **NOT an upstream enum**; upstream payment-facilitator settlement-recovery designs express polling as an interval + window pattern, not a named-strategy enum.

```text
exponential
linear
immediate
webhook
unknown
```

PEAC records the caller-reported categorical label; PEAC does NOT validate that the reported strategy actually matches the polling behavior the caller performed.

---

## 8. Money-Boundary Invariant (NORMATIVE)

**GATE-EXP-003 (MUST):** `amount_minor` (when present) uses the shared `AmountMinorStringSchema` grammar (bounded base-10 integer string) plus the Gateway Export non-negative profile constraint. The validator MUST reject any payload that provides a JS `number`, decimal form, comma-separated form, empty string, OR a negative value for `amount_minor` with error code `gateway.export.invalid_amount_minor`. Gateway-export `amount_minor` is caller-reported payment value evidence (not refund-delta semantics); refund / void / failure outcomes are captured by the event_kind discriminator, not by amount sign.

The non-negative constraint is implemented as a Gateway Export profile-local refine wrapped around the shared `AmountMinorStringSchema` grammar (not as a change to the shared grammar itself; other profiles MAY constrain `amount_minor` differently).

Bounded decimal string at the input boundary is the canonical PEAC pattern for monetary values; it preserves precision above `Number.MAX_SAFE_INTEGER` and avoids the precision-loss class that downstream numeric casts re-introduce.

### Single-canonical-money-field invariant

**GATE-EXP-001 + GATE-EXP-003 (MUST):** The base `amount_minor` field is the **only** monetary field on a gateway-export record. When the caller-reported EIP-3009-style four-tuple references (`payer_ref` / `pay_to_ref` / `nonce_ref`) are present, `amount_minor` represents the four-tuple `value` component. PEAC does NOT define a separate `value_minor` field; records carrying a `value_minor` key reject with `gateway.export.unknown_field` via the strict variant schema. (`value_minor` is a rejected alternate money-field name, not raw payment data, so it does NOT borrow the `inline_payment_data_blocked` diagnostic.) This prevents dual amount fields that could disagree on the same record.

PEAC does NOT verify EIP-3009 validity, four-tuple correctness, payer / payTo authorization, or nonce uniqueness.

---

## 9. No-Inline-Payment-Data Invariant (NORMATIVE)

**GATE-EXP-001 (MUST):** The validator MUST reject any gateway-export payload that contains any of the following 19 top-level keys, using error code `gateway.export.inline_payment_data_blocked`:

`transaction_data`, `raw_tx`, `tx_hash_value`, `nonce`, `raw_nonce`, `payer`, `pay_to`, `payTo`, `payment_payload`, `authorization`, `authorization_payload`, `card_number`, `pan`, `cvv`, `token`, `bearer_token`, `api_key`, `private_key`, `credential`

This invariant is grammar-based, not heuristic-based. The validator rejects on key-name presence; it does not inspect value contents for these keys. The rejection fires before the Zod discriminated-union parse so callers always see `gateway.export.inline_payment_data_blocked` rather than Zod's `unrecognized_keys` for these specific keys.

Raw transaction data, raw nonces, raw EIP-3009 four-tuple addresses (`payer`, `pay_to`, `payTo`), payment payloads, authorization payloads, and credential material MUST be referenced via opaque references (`tx_ref`, `nonce_ref`, `payer_ref`, `pay_to_ref`, etc.) and not inlined.

`value_minor` is intentionally NOT in this list. The single-canonical-money-field invariant (Section 8) defines `amount_minor` as the only monetary field; a `value_minor` key on a record is rejected as `gateway.export.unknown_field` via the strict variant schema. This keeps the public error semantics precise: `inline_payment_data_blocked` is reserved for raw payment-data classes; an alternate money-field name is an unknown-field rejection.

---

## 10. Stable Error Codes

| Code                                               | When emitted                                                                                                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateway.export.invalid_payload`                   | Top-level payload is not a JSON object (`null`, `undefined`, array, or primitive)                                                                                                                                       |
| `gateway.export.inline_payment_data_blocked`       | Forbidden top-level payment-data key present (one of the 19 raw-payment-data keys in Section 9; `value_minor` is NOT in this set)                                                                                       |
| `gateway.export.unknown_field`                     | Unrecognized top-level key not in the forbidden list and not in the schema for the given `event_kind`. Includes `value_minor` (rejected alternate money-field name; the single canonical money field is `amount_minor`) |
| `gateway.export.opaque_ref_grammar_violation`      | `*_ref` field fails the `OpaqueRefSchema` grammar                                                                                                                                                                       |
| `gateway.export.ref_must_be_string`                | Non-string value provided for a `*_ref` field                                                                                                                                                                           |
| `gateway.export.missing_required_field`            | Required field absent (event_kind, gateway_ref, payment_ref, observed_at, per-kind required field, or custom-timing field)                                                                                              |
| `gateway.export.invalid_event_kind`                | `event_kind` value not in the closed enum of 8 values                                                                                                                                                                   |
| `gateway.export.invalid_observed_at`               | Malformed RFC 3339 timestamp on `observed_at` / `submitted_at` / `timeout_deadline` / `timeout_at` / `last_checked_at` / `confirmed_at`                                                                                 |
| `gateway.export.invalid_amount_minor`              | `amount_minor` fails the shared `AmountMinorStringSchema` grammar OR the Gateway Export non-negative profile constraint (numeric, decimal, comma-formatted, empty, OR negative values reject)                           |
| `gateway.export.invalid_digest`                    | Digest field fails the sha256-hex grammar                                                                                                                                                                               |
| `gateway.export.invalid_timeout_profile`           | `timeout_profile` value not in the closed enum (`datacenter` / `east_africa_3g` / `west_africa_3g` / `custom`)                                                                                                          |
| `gateway.export.invalid_polling_strategy`          | `polling_strategy` value not in the closed enum                                                                                                                                                                         |
| `gateway.export.invalid_poll_count`                | `poll_count` exceeds bounds (0..1_000_000) or is non-integer / unsafe                                                                                                                                                   |
| `gateway.export.invalid_check_count`               | `check_count` exceeds bounds (0..1_000_000) or is non-integer / unsafe                                                                                                                                                  |
| `gateway.export.invalid_deadline_exceeded_ms`      | `deadline_exceeded_ms` exceeds bounds (0..2_592_000_000) or is non-integer / unsafe                                                                                                                                     |
| `gateway.export.invalid_delay_ms`                  | `delay_ms` exceeds bounds (0..2_592_000_000) or is non-integer / unsafe                                                                                                                                                 |
| `gateway.export.invalid_valid_before_unix_seconds` | `valid_before_unix_seconds` is negative, non-integer, or unsafe                                                                                                                                                         |
| `gateway.export.invalid_facilitator_timeout_ms`    | `facilitator_timeout_ms` exceeds bounds (0..2_592_000_000) or is non-integer / unsafe                                                                                                                                   |
| `gateway.export.invalid_poll_interval_ms`          | `poll_interval_ms` exceeds bounds (0..2_592_000_000) or is non-integer / unsafe                                                                                                                                         |
| `gateway.export.invalid_max_poll_window_ms`        | `max_poll_window_ms` exceeds bounds (0..2_592_000_000) or is non-integer / unsafe                                                                                                                                       |
| `gateway.export.field_too_large`                   | Bounded string field exceeds its maximum byte length (`asset`, `network`, `final_state`, `last_known_state`)                                                                                                            |
| `gateway.export.type_uri_unknown`                  | Type URI passed to `validateGatewayExportForType` is not in the closed set of 8 recognized gateway-export type URIs                                                                                                     |
| `gateway.export.type_event_kind_mismatch`          | `event_kind` in payload does not match the expected value derived from the type URI (via `validateGatewayExportForType`)                                                                                                |

The distinction between `inline_payment_data_blocked` and `unknown_field` is normative: a forbidden-list key (one of the 19 raw payment-data keys in Section 9) always produces `inline_payment_data_blocked`; any other extra key produces `unknown_field`. `value_minor` falls under `unknown_field`: it is a rejected alternate money-field name, not raw payment data, so it does not borrow the `inline_payment_data_blocked` diagnostic. The distinction between `invalid_payload` and the per-key codes is also normative: `invalid_payload` is reserved for shapes that cannot be a JSON object (`null`, `undefined`, array, or primitive). Callers MUST treat these codes as distinct diagnostic signals.

---

## 11. Gateway Boundary (NORMATIVE)

**GATE-EXP-010 (MUST):** Spec boundary text is normative and vendor-neutral.

PEAC records portable signed interaction records describing what a caller observed at a payment gateway or facilitator. PEAC does NOT settle transactions, route payments, contact gateways, verify on-chain state, monitor settlements, enforce recovery policy, resolve settlement disputes, or vouch for the legal validity of any settlement decision. Recovery decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

PEAC does not replace, govern, score, or operate the payment gateway, facilitator, processor, chain, recovery middleware, or policy engine that produced the events. PEAC records what the caller reported; the caller's issuer is the signer-of-record.

---

## 12. Composition with Gateway Systems (INFORMATIVE)

Gateway Export Records compose with external payment-gateway and facilitator systems without PEAC depending on or governing those systems. Adapter-level mappings live in `packages/mappings/*` and `packages/rails/*`; PEAC core remains gateway-agnostic.

The `upstream_artifact_ref` and `upstream_artifact_digest` fields preserve a reference to the raw upstream gateway / facilitator artifact verbatim, with a SHA-256 digest binding. The `payer_ref`, `pay_to_ref`, and `nonce_ref` fields carry the caller-reported components of canonical payment four-tuples (e.g., the EIP-3009 `(payer, payTo, value, nonce)` four-tuple) as opaque references; the `value` component is carried by the existing base `amount_minor` field under the single-canonical-money-field invariant.

PEAC does not implement payment-rail SDKs, on-chain verification, settlement-orchestration loops, or facilitator polling logic. Implementations that perform those operations and want to emit PEAC records can compose them with the schema validator and signing path.

---

## 13. Conformance Vectors

Positive and negative conformance vectors are at:

- `specs/conformance/parity-corpus/gateway-export/vectors.json` (8 positive vectors, one per event kind)
- `packages/schema/__tests__/extensions/gateway-export.test.ts` (negative vectors for all stable error codes)
- `packages/schema/__tests__/extensions/gateway-export-registry.test.ts` (registry mapping for GATE-EXP-009)

---

## 14. Parity and Verification

The schema validator `validateGatewayExport` (exported from `@peac/schema`) is the canonical Layer 3 validator. It returns the structured error contract `{ ok: true, value } | { ok: false, errors: [{ code, path?, message }] }`. No generic Zod error messages leak as public diagnostics.

The helper `validateGatewayExportForType(typeUri, data)` validates a gateway-export payload AND asserts that its `event_kind` matches the type URI from the wire-record envelope. It accepts an untrusted `string` so callers can pass the envelope `type` field directly without casting. If `typeUri` is not one of the 8 recognized gateway-export type URIs, it emits `gateway.export.type_uri_unknown`. If the type URI is valid but the `event_kind` disagrees, it emits `gateway.export.type_event_kind_mismatch`. Use this helper when processing records received from a wire carrier.

---

## 15. Non-Goals

PEAC Gateway Export Records do not:

- Settle transactions, route payments, or contact payment gateways or facilitators
- Verify on-chain state, transaction inclusion, or settlement finality
- Monitor settlements, run polling loops, or trigger recovery flows
- Enforce recovery policy, retry policy, or facilitator-timeout policy
- Resolve settlement disputes, chargebacks, or refunds
- Vouch for the legal validity of any settlement decision
- Implement EIP-3009, gas estimation, or chain-specific transaction handling
- Score, rank, or evaluate gateway, facilitator, payer, or merchant behavior
- Operate a payment gateway, facilitator, processor, or settlement orchestrator
- Depend on any specific payment-rail SDK

The eight event kinds record that the caller observed a corresponding gateway / facilitator event; they do not imply PEAC performed or evaluated the event. PEAC records the caller's observation, not PEAC's judgment.

---

## 16. Informative References

External payment-facilitator settlement-recovery design discussions are cited here for informative context only. PEAC schema names, error codes, type URIs, and normative text remain PEAC-neutral and are not derived from any external SDK or framework.

- x402 Issue #2294 ("Settlement recovery after facilitator timeout"), `x402-foundation/x402`. Documents a 7-state settlement-recovery model (`pending`, `confirmed`, `unresolved`, `polling`, `confirmed_late`, `failed`, `failed_orphaned`) and the `SettlementContext` shape (`settlementId`, `txHash`, `validBefore?`, `timedOut`). PEAC's 8 type URIs are aligned with this 7-state model; the additional `gateway-facilitator-timeout-observed` URI records the timeout trigger event itself (not a new settlement state).
- EIP-3009 (Transfer With Authorization) defines the `(payer, payTo, value, nonce, validBefore)` shape that backs the optional four-tuple-evidence fields (`payer_ref`, `pay_to_ref`, `nonce_ref`, `valid_before_unix_seconds`) on every gateway-export variant. PEAC records caller-reported references; PEAC does NOT verify EIP-3009 validity.
