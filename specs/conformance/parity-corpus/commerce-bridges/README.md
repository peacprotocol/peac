# Commerce-bridges parity corpus

One-per-family commerce evidence parity vectors covering x402 settlement, ACP delegated-payment, MPP/paymentauth attempt+settlement, and Stripe SPT mappings. The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing canonical path on every vector. Divergence is stop-the-line.

## Coverage (4 vectors at floor)

| Vector id                               | Family                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cb-001-x402-settlement`                | x402 settlement observation; upstream artifact preserved.                                       |
| `cb-002-acp-delegated-payment`          | ACP delegated-payment observation; lifecycle metadata preserved verbatim from upstream session. |
| `cb-003-paymentauth-attempt-settlement` | MPP/paymentauth attempt and upstream-attested settlement.                                       |
| `cb-004-stripe-spt`                     | Stripe Shared Payment Token; SPT is a grant artifact, not payment finality.                     |

## Mapper-boundary discipline

Per the v0.12.11 mapper-boundary finality guard (DD-226..DD-237) and the canonical Layer 4 mapping rule, commerce extension `event` fields preserve the upstream artifact verbatim and **do not synthesize payment finality** (authorization, capture, settlement, void, refund) from non-payment artifacts or lifecycle states alone. The validator's job in this corpus is structural envelope validation: it does not interpret upstream commerce semantics, and it does not assert a payment was settled unless the upstream artifact explicitly says so.

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. The vectors carry commerce metadata in the `org.peacprotocol/commerce` extension namespace, including a `rail` discriminator and an `upstream_artifact` block preserving the source data.

## Floor count

This family ships 4 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
