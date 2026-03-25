# Commerce Evidence Specification

## Purpose

This document defines how PEAC records evidence from commerce, payment, and checkout protocols. PEAC is the evidence layer: it records what happened, never executes payments, coordinates checkout, or manages wallets.

## Semantic Boundary

PEAC mappings MUST preserve raw upstream artifacts and MUST NOT synthesize payment finality from non-payment artifacts or lifecycle states alone.

Concretely:

- An ACP session "completed" does not prove payment settlement
- A Stripe SPT "grant" does not prove payment authorization
- A paymentauth "receipt" proves what the upstream server attested, not more
- A UCP order "completed" does not prove payment captured

Commerce extension `event` fields (`authorization`, `capture`, `settlement`, `refund`, `void`, `chargeback`) may only be set when the upstream artifact explicitly proves the claimed payment state.

## Rail Neutrality

Per DD-95, PEAC core packages never mandate a specific payment rail. The commerce extension `payment_rail` field is a free string (max 128 chars). Registered rails are informational; unregistered values are accepted.

## Commerce Extension

The `org.peacprotocol/commerce` extension group carries observational payment metadata:

| Field          | Type   | Required | Description                                  |
| -------------- | ------ | -------- | -------------------------------------------- |
| `payment_rail` | string | Yes      | Payment rail identifier                      |
| `amount_minor` | string | Yes      | Base-10 integer string (arbitrary precision) |
| `currency`     | string | Yes      | ISO 4217 or asset identifier                 |
| `reference`    | string | No       | Payment reference                            |
| `asset`        | string | No       | Asset identifier for non-fiat                |
| `env`          | enum   | No       | `live` or `test`                             |
| `event`        | enum   | No       | Observational lifecycle phase                |

The `event` field values: `authorization`, `capture`, `settlement`, `refund`, `void`, `chargeback`. This field is observational metadata only (DD-184): it does not encode settlement finality, protocol state transitions, or lifecycle enforcement.

## Evidence Extraction Patterns

### paymentauth / MPP

HTTP `Payment` authentication scheme (`draft-ryan-httpauth-payment`), commonly referred to in the MPP ecosystem.

- **Approach**: envelope-first; method-specific payloads treated as `unknown`
- **Package**: `@peac/mappings-paymentauth`
- **receipt_ref**: `sha256(raw_receipt_header_value)`, not assumed JWS
- **Co-existence**: PEAC `PEAC-Receipt` and paymentauth `Payment-Receipt` can appear on the same HTTP response; no semantic coupling implied

### ACP (Agentic Commerce Protocol)

- **Approach**: lifecycle-first; session states produce access evidence; commerce evidence only from explicit payment artifacts
- **Package**: `@peac/mappings-acp`
- **Boundary**: `fromACPSessionLifecycleEvent()` for session evidence; `fromACPPaymentObservation()` for commerce evidence requiring `observed_payment_state`

### Stripe SPT (Shared Payment Tokens)

- **Approach**: delegation-first; SPT grant/use/deactivate are delegation lifecycle events
- **Package**: `@peac/rails-stripe`
- **Boundary**: SPT functions produce delegation evidence; only `fromStripePaymentIntentObservation()` emits commerce events; `succeeded` maps to settlement; `requires_capture` maps to authorization; `processing` and `canceled` produce no commerce event

### x402

- **Approach**: verification-first; 4-layer architecture (A1/A2/B/C)
- **Package**: `@peac/adapter-x402`
- **v0.12.4**: dual-header read compatibility (DD-193); reads PEAC-Receipt, PAYMENT-RESPONSE (v2), X-PAYMENT-RESPONSE (v1)
- **v0.12.5**: full v2 adapter (plugin arch, CAIP, multi-facilitator, wallet sessions)

### UCP (Universal Commerce Protocol)

- **Approach**: order-vs-payment separation (DD-187); order state distinct from payment state
- **Package**: `@peac/mappings-ucp`
- **Boundary**: `payment_state_source` marker distinguishes `explicit` from `derived_order_fallback`

## Cross-Ecosystem Evidence

PEAC can normalize evidence from multiple commerce protocols into a single audit bundle. The experimental `CommerceEvidenceBundle` in `@peac/audit` correlates receipts across payment rails without aggregating or asserting settlement totals.
