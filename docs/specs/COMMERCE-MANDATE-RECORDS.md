# Commerce Mandate Records Profile

**Profile version:** 0.1
**Extension namespace:** `org.peacprotocol/commerce-mandate`
**Scope:** OBSERVER - records observations of commerce-lifecycle events scoped to a mandate
**Introduced in:** v0.14.3
**Conformance section:** 33 (COMM-MAN-001..COMM-MAN-010)

---

## 1. Overview

Commerce Mandate Records provide a portable signed record of caller-reported commerce-lifecycle events (mandate / authorization / capture / void / refund / settlement / budget) scoped to a mandate. The caller observed the event; the caller's issuer signs and issues the record. PEAC provides the record format, validation, and signing path.

**PEAC does not authorize payments, process payments, settle funds, enforce mandates, compute payment finality, evaluate budgets, validate payment rails, or vouch for the legal validity of any commerce decision.** Commerce decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

The record creates portable, verifiable evidence of commerce-lifecycle events that can be verified outside the system that produced it.

### Normative keywords

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capital letters.

---

## 2. Extension Group Registration

| Field               | Value                               |
| ------------------- | ----------------------------------- |
| Extension namespace | `org.peacprotocol/commerce-mandate` |
| `extensions` key    | `org.peacprotocol/commerce-mandate` |
| Status              | informational                       |

---

## 3. Type URIs

Seven type URIs, each corresponding to one event kind. All seven describe commerce-lifecycle events scoped to a mandate.

| Type URI                                           | Event kind                        | Pillar   |
| -------------------------------------------------- | --------------------------------- | -------- |
| `org.peacprotocol/commerce-mandate-observed`       | `commerce-mandate-observed`       | commerce |
| `org.peacprotocol/commerce-authorization-observed` | `commerce-authorization-observed` | commerce |
| `org.peacprotocol/commerce-capture-observed`       | `commerce-capture-observed`       | commerce |
| `org.peacprotocol/commerce-void-observed`          | `commerce-void-observed`          | commerce |
| `org.peacprotocol/commerce-refund-observed`        | `commerce-refund-observed`        | commerce |
| `org.peacprotocol/commerce-settlement-observed`    | `commerce-settlement-observed`    | commerce |
| `org.peacprotocol/commerce-budget-observed`        | `commerce-budget-observed`        | commerce |

The type URI in the PEAC record envelope (`type` field) MUST match the `event_kind` in the extension body (drop the `org.peacprotocol/` prefix to get `event_kind`).

---

## 4. Schema

### 4.1 Common required fields (all event kinds)

| Field         | Type               | Description                                  |
| ------------- | ------------------ | -------------------------------------------- |
| `event_kind`  | string (enum)      | Discriminator; one of the seven values above |
| `mandate_ref` | OpaqueRef          | Reference to the mandate                     |
| `observed_at` | RFC 3339 timestamp | When the caller observed the event           |

### 4.2 Common optional fields (all event kinds)

| Field                      | Type       | Description                                                    |
| -------------------------- | ---------- | -------------------------------------------------------------- |
| `caller_ref`               | OpaqueRef  | Who reported the event                                         |
| `policy_ref`               | OpaqueRef  | Referenced commerce policy                                     |
| `policy_digest`            | sha256-hex | Digest of the referenced policy document                       |
| `upstream_artifact_ref`    | OpaqueRef  | Reference to an upstream artifact (rail response, gateway log) |
| `upstream_artifact_digest` | sha256-hex | Digest of an upstream artifact                                 |
| `parent_ref`               | OpaqueRef  | Parent event (e.g., authorization to which this capture binds) |
| `scheme_id`                | string     | Bounded scheme identifier (see Section 6)                      |
| `scheme_ref`               | OpaqueRef  | Opaque scheme reference (mutually exclusive with `scheme_id`)  |

### 4.3 Per-event-kind additional fields

| Event kind                        | Additional required                                              | Additional optional                                                             |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `commerce-mandate-observed`       | `merchant_ref`, `payer_ref`                                      | `max_amount_minor`, `currency`, `expires_at`                                    |
| `commerce-authorization-observed` | `authorization_ref`, `amount_minor`, `currency`                  | (none) - `settlement_state` is **forbidden** on this kind                       |
| `commerce-capture-observed`       | `authorization_ref`, `capture_ref`, `amount_minor`, `currency`   | (none)                                                                          |
| `commerce-void-observed`          | `authorization_ref`, `void_ref`                                  | (none)                                                                          |
| `commerce-refund-observed`        | `refund_ref`, `amount_minor`, `currency`                         | `capture_ref`, `authorization_ref`                                              |
| `commerce-settlement-observed`    | `settlement_ref`, `amount_minor`, `currency`, `settlement_state` | (none) - this is the **only** event kind on which `settlement_state` is allowed |
| `commerce-budget-observed`        | `budget_ref`                                                     | `amount_minor`, `currency`                                                      |

---

## 5. Opaque Reference Grammar

All `*_ref` fields follow the shared OpaqueRefSchema grammar:

- Recognized prefixes: `ref:`, `urn:`, `did:`, `sha256:`, `peac:`, `https:`
- Maximum 256 UTF-8 bytes
- No whitespace, no `@`, no JSON-opening characters
- Numeric-only strings reject (no recognized prefix)
- Email-shaped strings reject (`@` character blocked)

The fields under this grammar are: `mandate_ref`, `merchant_ref`, `payer_ref`, `authorization_ref`, `capture_ref`, `void_ref`, `refund_ref`, `settlement_ref`, `budget_ref`, `caller_ref`, `policy_ref`, `upstream_artifact_ref`, `parent_ref`, `scheme_ref`.

---

## 6. Scheme Identifier Grammar

The optional `scheme_id` field identifies the payment scheme or rail in a vendor-neutral, bounded form:

- Bounded grammar: `[a-z0-9._:/+-]{1,128}` (lowercase preferred; ASCII / URI-like)
- Maximum 128 UTF-8 bytes
- No whitespace, no `@`, no JSON-opening characters
- NOT a closed enum: any caller-defined scheme identifier is accepted as long as it matches the grammar
- Examples: `card-network`, `urn:scheme:custom`, `bank-transfer`

When the caller wants to keep the scheme identity opaque (provider-scoped, sensitive, or pre-issued), `scheme_ref` may be used instead. `scheme_id` and `scheme_ref` are **mutually exclusive**; setting both rejects with `commerce.mandate.scheme_conflict`.

---

## 7. Money-Boundary Invariant (NORMATIVE)

**COMM-MAN-003 (MUST):** All amount fields use a non-negative wrapper around the shared `AmountMinorStringSchema` (base-10 integer string). The validator MUST reject any payload that provides a JS `number`, decimal form, comma-separated form, empty string, or negative value for any amount field with error code `commerce.mandate.invalid_amount_minor`.

Bounded decimal string at the input boundary is the canonical PEAC pattern for monetary values; it preserves precision above `Number.MAX_SAFE_INTEGER` and avoids the precision-loss class that downstream numeric casts re-introduce. The fields under this invariant are: `amount_minor`, `max_amount_minor`.

Refund semantics are reported via `commerce-refund-observed`; settlement reversal is reported via `commerce-settlement-observed` with `settlement_state = 'reversed'`.

This carries forward the money-boundary discipline applied at the adapter layer earlier in v0.14.3: monetary amounts at the input boundary are bounded decimal strings, validated by a shared schema; numeric and negative forms are hard-rejected.

---

## 8. Finality-Synthesis Boundary (NORMATIVE)

**COMM-MAN-006 (MUST):** The validator MUST reject `settlement_state` on any non-settlement event kind with error code `commerce.mandate.finality_synthesis_blocked`.

Authorization is not settlement. Capture is not settlement. Void is not settlement. Refund is not settlement. Mandate binding is not settlement. Budget observation is not settlement. **Settlement finality MAY be reported only via `commerce-settlement-observed` records**, where `settlement_state` is a required field whose value is a caller-attested closed enum (`pending` / `completed` / `failed` / `reversed` / `partial`).

This invariant prevents a caller from synthesizing settlement finality at the wrong event kind. It applies the mapper-boundary finality rule at the schema layer.

---

## 9. No-Inline-Payment-Data Invariant (NORMATIVE)

**COMM-MAN-001 (MUST):** The validator MUST reject any commerce mandate payload that contains any of the following top-level keys, using error code `commerce.mandate.inline_payment_data_blocked`:

`card_number`, `pan`, `cvv`, `cvc`, `expiry_date`, `card_holder_name`, `billing_address`, `shipping_address`, `token`, `raw_token`, `bearer_token`, `api_key`, `secret`, `private_key`, `private_key_pem`, `credential`, `password`, `connection_string`, `iban`, `bank_account`

This invariant is grammar-based, not heuristic-based. The validator rejects on key name presence; it does not inspect value contents for these keys. The rejection fires before the Zod discriminated-union parse so callers always see `commerce.mandate.inline_payment_data_blocked` rather than Zod's `unrecognized_keys` for these specific keys.

---

## 10. Stable Error Codes

| Code                                            | When emitted                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `commerce.mandate.inline_payment_data_blocked`  | Forbidden top-level payment-data key present (one of the 20 keys in Section 9)                                                          |
| `commerce.mandate.unknown_field`                | Unrecognized top-level key not in the forbidden list and not in the schema for the given event_kind                                     |
| `commerce.mandate.opaque_ref_grammar_violation` | `*_ref` field fails the OpaqueRefSchema grammar                                                                                         |
| `commerce.mandate.ref_must_be_string`           | Non-string value provided for a `*_ref` field                                                                                           |
| `commerce.mandate.missing_required_field`       | Required field absent (event_kind, mandate_ref, observed_at, or event-kind-specific required field)                                     |
| `commerce.mandate.invalid_event_kind`           | `event_kind` value not in the closed enum of 7 values (also rejects stale draft URI names)                                              |
| `commerce.mandate.invalid_amount_minor`         | Amount field is not a bounded non-negative base-10 integer string (numeric, decimal, comma-formatted, empty, or negative values reject) |
| `commerce.mandate.invalid_currency`             | Currency field fails the `[A-Z0-9_-]{1,16}` grammar                                                                                     |
| `commerce.mandate.invalid_observed_at`          | Malformed RFC 3339 timestamp in `observed_at` or `expires_at`                                                                           |
| `commerce.mandate.invalid_digest`               | Digest field fails the sha256-hex grammar                                                                                               |
| `commerce.mandate.invalid_settlement_state`     | `settlement_state` value not in the closed enum (`pending` / `completed` / `failed` / `reversed` / `partial`)                           |
| `commerce.mandate.finality_synthesis_blocked`   | `settlement_state` present on any non-settlement event kind                                                                             |
| `commerce.mandate.invalid_scheme_id`            | `scheme_id` fails the bounded grammar (Section 6)                                                                                       |
| `commerce.mandate.scheme_conflict`              | Both `scheme_id` and `scheme_ref` are present (mutually exclusive)                                                                      |
| `commerce.mandate.type_uri_unknown`             | Type URI passed to `validateCommerceMandateForType` is not in the closed set of 7 recognized commerce mandate type URIs                 |
| `commerce.mandate.type_event_kind_mismatch`     | `event_kind` in payload does not match the expected value derived from the type URI (via `validateCommerceMandateForType`)              |

The distinction between `inline_payment_data_blocked` and `unknown_field` is normative: a forbidden-list key always produces `inline_payment_data_blocked`; any other extra key produces `unknown_field`. Callers MUST treat these codes as distinct diagnostic signals.

---

## 11. Commerce Boundary (NORMATIVE)

**COMM-MAN-010 (MUST):** Spec boundary text is normative and vendor-neutral.

PEAC records portable signed interaction records describing what a caller observed about a commerce-lifecycle event. PEAC does not authorize payments, process payments, settle funds, enforce mandates, compute payment finality, evaluate budgets, validate payment rails, or vouch for the legal validity of any commerce decision. Commerce decisions are reported by the caller; the record describes what the caller observed, not what PEAC decided.

PEAC does not replace, govern, or score the payment rail, gateway, processor, mandate system, or policy engine that produced the events. PEAC records what the caller reported; the caller's issuer is the signer-of-record.

---

## 12. Composition with Commerce Systems (INFORMATIVE)

Commerce Mandate Records compose with external commerce systems such as payment gateways, mandate frameworks, payment authorization protocols, and settlement rails without PEAC depending on or governing those systems. Adapter-level mappings live in `packages/mappings/*` and `packages/rails/*`; PEAC core remains rail-agnostic.

The `scheme_id` field carries a vendor-neutral identifier when the scheme is publicly known; the `scheme_ref` field carries an opaque reference when the scheme is provider-scoped or sensitive. The `upstream_artifact_ref` and `upstream_artifact_digest` fields preserve a reference to the raw upstream payment-rail artifact verbatim, with a SHA-256 digest binding.

---

## 13. Conformance Vectors

Positive and negative conformance vectors are at:

- `specs/conformance/parity-corpus/commerce-mandate/vectors.json` (7 positive vectors, one per event kind)
- `packages/schema/__tests__/extensions/commerce-mandate.test.ts` (negative vectors for all stable error codes)
- `packages/schema/__tests__/extensions/commerce-mandate-registry.test.ts` (registry mapping for COMM-MAN-009)

---

## 14. Parity and Verification

The schema validator `validateCommerceMandate` (exported from `@peac/schema`) is the canonical Layer 3 validator. It returns the structured error contract `{ ok: true, value } | { ok: false, errors: [{ code, path?, message }] }`. No generic Zod error messages leak as public diagnostics.

The helper `validateCommerceMandateForType(typeUri, data)` validates a commerce mandate payload AND asserts that its `event_kind` matches the type URI from the wire-record envelope. It accepts an untrusted `string` so callers can pass the envelope `type` field directly without casting. If `typeUri` is not one of the 7 recognized commerce mandate type URIs, it emits `commerce.mandate.type_uri_unknown`. If the type URI is valid but the `event_kind` disagrees, it emits `commerce.mandate.type_event_kind_mismatch`. Use this helper when processing records received from a wire carrier.

Commerce mandate records issued via `@peac/protocol.issue()` using any of the 7 type URIs in `COMMERCE_MANDATE_TYPE_URIS` MUST round-trip through `verifyLocal()` (COMM-MAN-008).

---

## 15. Non-Goals

PEAC Commerce Mandate Records do not:

- Authorize, process, or settle payments
- Enforce mandate policy, scope, or authorization limits
- Compute payment finality across rails
- Evaluate or enforce budget thresholds
- Validate payment rail connectivity or rail-specific business rules
- Vouch for the legal validity of any commerce decision
- Implement payment-card data handling, tokenization, or vault storage
- Score, rank, or evaluate merchant or payer behavior
- Operate a payment gateway, processor, or settlement orchestrator
- Depend on any specific payment-rail SDK

The seven event kinds record that the caller observed a corresponding commerce event reported by an external rail or mandate system; they do not imply PEAC performed or evaluated the event. PEAC records the caller's observation, not PEAC's judgment.
