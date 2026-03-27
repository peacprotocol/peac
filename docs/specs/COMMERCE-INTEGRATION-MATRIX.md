# Commerce Integration Matrix

Reference table for PEAC commerce evidence integrations across supported rails and protocols.

## Rail and Protocol Summary

| Rail / Protocol                                  | Mapping Package              | Registered ID                     | Evidence Types                          | `commerce.event` Support                      | Carrier Transport       |
| ------------------------------------------------ | ---------------------------- | --------------------------------- | --------------------------------------- | --------------------------------------------- | ----------------------- |
| paymentauth (HTTP Payment authentication scheme) | `@peac/mappings-paymentauth` | `paymentauth`                     | Payment challenges, receipts            | No direct `commerce.event`; attestation-based | `PEAC-Receipt` header   |
| Agentic Commerce Protocol (ACP)                  | `@peac/mappings-acp`         | `acp` (session), varies (payment) | Session lifecycle, payment observations | Only from explicit `observed_payment_state`   | `PEAC-Receipt` header   |
| Stripe SPT (Shared Payment Tokens)               | `@peac/rails-stripe`         | `stripe`                          | Delegation lifecycle, PI observations   | Only from PI observation with terminal status | `PEAC-Receipt` header   |
| x402                                             | `@peac/adapter-x402`         | `x402`                            | Offer/receipt verification              | Per receipt content                           | `PEAC-Receipt` header   |
| Universal Commerce Protocol (UCP)                | `@peac/mappings-ucp`         | `ucp` (order), varies (payment)   | Order lifecycle, payment evidence       | Only with explicit `payment_state`            | Webhook `peac_evidence` |

## Evidence Extraction Approach

| Rail / Protocol | Approach           | Key Function(s)                                                          |
| --------------- | ------------------ | ------------------------------------------------------------------------ |
| paymentauth     | Envelope-first     | `parsePaymentauthChallenges()`, `fromPaymentauthReceipt()`               |
| ACP             | Lifecycle-first    | `fromACPSessionLifecycleEvent()`, `fromACPPaymentObservation()`          |
| Stripe SPT      | Delegation-first   | `fromSPTGrant()`, `fromSPTUse()`, `fromStripePaymentIntentObservation()` |
| x402            | Verification-first | `extractReceiptArtifactFromHeaders()`                                    |
| UCP             | Order-vs-payment   | `mapUcpOrderToReceipt()`, `payment_state_source` marker                  |

## Semantic Boundary Rules

All commerce integrations follow the same boundary rule: PEAC preserves raw upstream artifacts and does not synthesize payment finality from non-payment artifacts or lifecycle states alone.

- **paymentauth**: a receipt proves what the upstream server attested, not more
- **ACP**: a session "completed" does not prove payment settlement; commerce evidence requires explicit `observed_payment_state`
- **Stripe SPT**: a grant does not prove payment authorization; only `fromStripePaymentIntentObservation()` emits commerce events
- **x402**: PEAC-Receipt is the carrier; upstream PAYMENT-RESPONSE is observational material, not a PEAC carrier
- **UCP**: an order "completed" does not prove payment captured; `payment_state_source` distinguishes explicit from derived

## Header Coexistence

paymentauth introduces a second receipt header (`Payment-Receipt`) that can coexist with `PEAC-Receipt` on the same HTTP response. The two headers serve different purposes and have no semantic coupling:

- `PEAC-Receipt`: signed PEAC interaction record (compact JWS)
- `Payment-Receipt`: paymentauth payment receipt (base64url JSON)

## Upstream Compatibility

| Rail / Protocol | Current Upstream Version                                 | Notes                                                 |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| paymentauth     | `draft-ryan-httpauth-payment-01` (active Internet-Draft) | Not a settled standard; aligned with the active draft |
| ACP             | `API-Version: 2026-01-30`                                | Previous `2026-01-22` deprecated; see note below      |
| A2A             | `v1.0.0` (released March 12, 2026)                       | PEAC adapter shipped in v0.12.3                       |
| UCP             | `v2026-01-23`                                            | Date-based versioning; active development             |
| x402            | v2 (recommended per Coinbase migration guide)            | PEAC reads both v1 and v2 headers                     |

ACP compatibility versioning is sourced from the [ACP repository changelog](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/tree/main/changelog). The public documentation website may lag behind the repository; when versions differ, the repository changelog is authoritative.

## Related Specifications

- [Commerce Evidence Specification](COMMERCE-EVIDENCE.md): extraction patterns and boundary rules
- [Commerce Semantics](COMMERCE-SEMANTICS.md): mapping rules and payment state vocabulary
- [Evidence Carrier Contract](EVIDENCE-CARRIER-CONTRACT.md): transport placement rules
- [Registries](REGISTRIES.md): registered payment rails
