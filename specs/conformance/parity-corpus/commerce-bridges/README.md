# Commerce-bridges parity corpus

One-per-family commerce evidence parity vectors covering x402 settlement, ACP delegated-payment, MPP/paymentauth attempt+settlement, and Stripe SPT mappings. The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing canonical path on every vector. Divergence is stop-the-line.

## Coverage (4 vectors at floor)

| Vector id                       | `payment_rail` | canonical `event` |
| ------------------------------- | -------------- | ----------------- |
| `cb-001-x402-settlement`        | `x402`         | `settlement`      |
| `cb-002-acp-authorization`      | `acp`          | `authorization`   |
| `cb-003-paymentauth-settlement` | `paymentauth`  | `settlement`      |
| `cb-004-stripe-authorization`   | `stripe`       | `authorization`   |

## Canonical envelope vs upstream-specific bridge metadata

Per the v0.12.11 mapper-boundary finality guard (DD-226..DD-237), commerce extension `event` is restricted to the canonical lifecycle enum (`authorization` / `capture` / `settlement` / `refund` / `void` / `chargeback`) and does not synthesize payment finality from non-payment artifacts or lifecycle states alone. Upstream-specific lifecycle vocabulary (e.g., ACP "delegated-payment-initiated", Stripe SPT "shared-payment-token-issued") and verbatim upstream artifacts live in adapter packages (`@peac/adapter-*`), not in the canonical envelope. **This corpus tests envelope validation only.** The bounded shadow-mode validator foundation must reach the same accept/reject verdict as the existing canonical path on every vector here; mapper-layer semantic preservation is tested separately in adapter-specific test suites.

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. The vectors carry commerce metadata in the `org.peacprotocol/commerce` extension namespace using the canonical typed schema (`payment_rail`, `amount_minor`, `currency`, optional `event` from the canonical lifecycle enum).

## Floor count

This family ships 4 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
