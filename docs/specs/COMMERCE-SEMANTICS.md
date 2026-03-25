# Commerce Evidence Semantic Boundaries

Canonical reference for the semantic rules governing commerce evidence in PEAC v0.12.4+. These boundaries apply across all Layer 4 mapping and rail packages.

## Core Rule

PEAC MUST preserve raw upstream artifacts and MUST NOT synthesize payment finality from non-payment artifacts or lifecycle states alone.

## Vocabulary

### Observed Payment State

Comes from explicit payment-bearing artifacts that prove a specific payment lifecycle stage. Only these produce commerce extension `event` fields.

Sources: PaymentIntent status (Stripe), payment receipt with status (paymentauth), settlement confirmation (x402).

### Derived Payment State

Exists only for backward compatibility when explicit payment evidence is absent. MUST be marked with `payment_state_source: 'derived_order_fallback'` or equivalent. Consumers MUST NOT treat derived state as observed truth.

### Delegation

SPT grant, use, and deactivation are delegation lifecycle events. They do NOT prove payment authorization, capture, or settlement. A PaymentIntent reference proves a payment object exists, not that authorization succeeded.

### Carrier Artifact vs Upstream Artifact

- `receipt_jws` on `PeacEvidenceCarrier`: PEAC compact JWS only
- `upstreamArtifact` / `rawPaymentReceipt`: upstream observational material, never verifier-ready PEAC carrier content

### Session/Order Lifecycle vs Payment Lifecycle

- ACP "completed" = checkout session completed, NOT payment settled
- ACP "canceled" = session canceled, NOT payment voided
- UCP "completed" order = fulfillment complete, NOT payment captured
- Commerce extension `event` only from explicit payment-bearing artifacts

## Mapping Rules

| Upstream Signal                             | PEAC Treatment                      | Commerce Event?                    |
| ------------------------------------------- | ----------------------------------- | ---------------------------------- |
| ACP session state change                    | Access/session evidence             | No                                 |
| ACP session + explicit payment artifact     | Commerce evidence                   | Yes (from observed_payment_state)  |
| SPT grant                                   | Delegation evidence                 | No                                 |
| SPT use (even with PI ref)                  | Delegation evidence                 | No                                 |
| SPT use + PI observation (succeeded)        | Commerce evidence                   | Yes (settlement)                   |
| SPT use + PI observation (requires_capture) | Commerce evidence                   | Yes (authorization)                |
| SPT use + PI observation (processing)       | Observation metadata                | No                                 |
| SPT use + PI observation (canceled)         | Observation metadata                | No                                 |
| paymentauth receipt                         | Evidence from upstream attestation  | Only if challenge proves amount    |
| x402 PEAC-Receipt                           | PEAC carrier (receipt_jws)          | Per receipt content                |
| x402 PAYMENT-RESPONSE                       | Upstream artifact (not receipt_jws) | No (observational)                 |
| UCP order completed                         | Order evidence                      | No (unless explicit payment_state) |
| UCP order + payment_state=settled           | Commerce evidence                   | Yes                                |

## Registry Lifecycle

Registry entries sourced from active drafts (e.g., `paymentauth` from `draft-ryan-httpauth-payment`) carry `status: "informational"`. Rules:

- When the upstream draft revises, update the reference URL in `registries.json`
- When the draft becomes an RFC, update the reference to the RFC URL and consider changing status
- No separate registry entry is needed per draft revision
- Draft-backed entries should be reviewed when the draft expires or is replaced
- The `paymentauth` entry references the datatracker landing page, which always resolves to the latest revision

## ACP Payment State Vocabulary

The `observed_payment_state` vocabulary used by `fromACPPaymentObservation()` is the canonical source for payment-state evidence across ACP integrations:

| State        | Commerce Event  | Meaning                                  |
| ------------ | --------------- | ---------------------------------------- |
| `attempted`  | None            | Payment attempted but not yet authorized |
| `authorized` | `authorization` | Payment authorized, capture pending      |
| `captured`   | `capture`       | Payment captured                         |
| `settled`    | `settlement`    | Payment settled (funds transferred)      |
| `failed`     | None            | Payment failed                           |
| `refunded`   | `refund`        | Payment refunded                         |

This vocabulary is exported from `@peac/mappings-acp` as the `ObservedPaymentState` type. Use it in examples, kits, and downstream integrations to prevent string drift.
