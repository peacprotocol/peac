# Commerce Protocol Coverage in PEAC

**Snapshot date:** April 14, 2026. For current upstream status, see the
linked specifications and per-protocol docs below.

This document distinguishes three truth surfaces so readers can reason about
where a given capability lives.

1. **Upstream protocol truth** — what each upstream commerce specification
   documents as stable.
2. **Upstream operator surfaces** — what individual operators (facilitators,
   payment service providers, network operators) document as supported in
   their own docs. Narrower than upstream protocol truth and varies per
   operator.
3. **PEAC-recorded truth** — what PEAC verifies and records as evidence
   end-to-end in this repo. Narrower than both. PEAC is the records layer;
   operators remain authoritative for protocol invariants.

Collapsing these into one blended "supported" statement leads to drift and
overclaim. PEAC keeps them separate.

## Coverage matrix

| Dimension                   | x402                                                                                                                                      | paymentauth (MPP)                                                                                                                                 | ACP                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Upstream specification**  | x402 protocol (Linux Foundation hosted; v2 stable, v1 legacy with dual-header read)                                                       | `draft-ryan-httpauth-payment-01` IETF Internet-Draft (active)                                                                                     | Agentic Commerce Protocol API-Version `2026-01-30` (OpenAI / Stripe)                                          |
| **Stability class**         | v2: Stable. v1: Legacy / dual-read                                                                                                        | Experimental (active draft; no settled RFC)                                                                                                       | Beta (versioned API; not yet GA)                                                                              |
| **What it does (one line)** | HTTP 402 challenge / response with offer, receipt, and settlement proof                                                                   | HTTP `Payment` authentication scheme for machine-to-machine payments and shared payment tokens                                                    | Agent commerce lifecycle: discovery, capability advertisement, checkout, payment handlers                     |
| **What PEAC records**       | Offer terms, scheme identifier, receipt artifact, settlement proof when explicitly present                                                | Payment-attempt envelope, settlement attestation, facilitator attestation when explicitly present, payment-token reference (never token material) | Session lifecycle events, capability snapshots, payment observation when `observed_payment_state` is supplied |
| **What PEAC does NOT do**   | Verify scheme-specific invariants (single-use, time bounds, recipient binding, facilitator binding, max-vs-actual settlement correctness) | Verify payment tokens cryptographically; bind facilitators; reason about refund / chargeback semantics                                            | Own payment processing; enforce checkout completion; synthesize finality from session state alone             |
| **Adapter / mapping**       | `@peac/adapter-x402` (scheme-agnostic at verification layer)                                                                              | `@peac/mappings-paymentauth` (envelope-first; raw + normalized)                                                                                   | `@peac/mappings-acp` (two-function boundary: session lifecycle vs payment observation)                        |
| **Backward compatibility**  | Reads x402 v1 + v2 dual-header order: `PEAC-Receipt` then `PAYMENT-RESPONSE` (v2) then `X-PAYMENT-RESPONSE` (v1)                          | Backward-compatible with x402 exact flows per Cloudflare and Stripe published interop notes                                                       | Versioned API; PEAC tracks the dated `API-Version` header value                                               |
| **Upstream watch list**     | SVM `upto` resolution, facilitator attestation surface, BCP, state channel work                                                           | `draft-02` if published; discovery draft; JSON-RPC / MCP transport draft                                                                          | API changelog for new capability negotiation or payment handler extensions                                    |

## Mapper-boundary finality-synthesis rule

Across all three protocols, PEAC enforces a single rule at the mapper
boundary in code (`@peac/adapter-core` `assertExplicitFinality`):

> Commerce mappings preserve raw upstream artifacts and MUST NOT synthesize
> payment finality from non-payment artifacts or lifecycle states alone.

The commerce extension `event` field
(`authorization`, `capture`, `settlement`, `refund`, `void`, `chargeback`)
may be set only when the upstream artifact explicitly proves the claimed
state. The guard ships in three modes:

- `strict` rejects any synthesis attempt and rejects silent fallbacks
  (currency `'UNKNOWN'`, defaulted env).
- `interop` (default) emits a deprecation warning instead of rejecting on
  silent fallbacks, but still rejects synthesis of finality-bearing events
  without explicit upstream artifacts.
- `legacy` preserves historical behavior with no warning. Reserved for
  consumers with an explicit migration plan.

Violations produce `MapperBoundaryError` carrying the stable code
`commerce.finality_synthesis_blocked`. This is a mapper-boundary identifier,
not a wire-level error code; the wire format is unchanged.

## Per-protocol notes

### x402

The PEAC adapter is scheme-agnostic at the verification layer. Any network
an upstream facilitator surfaces works at the PEAC evidence layer provided
the signed artifacts carry valid `network`, `asset`, `payTo`, `amount`, and
`scheme` values. Per-scheme invariants remain the responsibility of the
upstream protocol and the facilitator. See
[x402-scheme-coverage.md](./x402-scheme-coverage.md) for upstream / operator
/ PEAC-recorded scheme coverage detail.

The settlement-proof extractor returns the raw artifact and a minimal
normalized projection. It does not enforce single-use, time bounds,
recipient binding, facilitator binding, or max-vs-actual settlement
correctness.

### paymentauth (MPP)

The mapper is envelope-first. Method-specific payloads are carried as
`unknown` so PEAC stays neutral about the underlying payment method. The
`receipt_ref` is `sha256(raw_receipt_header_value)` and is not assumed to
be a JWS.

PEAC `PEAC-Receipt` and paymentauth `Payment-Receipt` may appear on the
same HTTP response with no semantic coupling implied.

The mapper rejects silent fallbacks under `strict` mode: missing or
`'UNKNOWN'` currency, defaulted `env`. Under `interop`, those produce
deprecation warnings.

### ACP (Agentic Commerce Protocol)

The mapper has a two-function boundary:

- `fromACPSessionLifecycleEvent()` produces session-lifecycle access
  evidence (no commerce semantics).
- `fromACPPaymentObservation()` produces commerce evidence and requires
  caller-supplied `observed_payment_state`. The mapper does not infer
  payment state from session state alone.

Discovery (capability snapshot) is observational and does not produce
commerce events.

## Originary-product surfaces and PEAC neutrality

PEAC Protocol owns the neutral evidence layer: mappings, conformance
fixtures, open-source adapters, the reference verifier
(self-hostable, tenantless), and distribution surface listings.
Operator-grade and product-grade surfaces (managed verification, buyer
workflows, enterprise trust center, billing, pilot facilitation) live
outside this repo and outside this matrix.

## See also

- [Commerce Evidence Specification](../specs/COMMERCE-EVIDENCE.md)
- [x402 Scheme Coverage](./x402-scheme-coverage.md)
- [Runtime Governance Coverage](./runtime-governance-coverage.md)
- [Compatibility Matrix](../COMPATIBILITY_MATRIX.md)
