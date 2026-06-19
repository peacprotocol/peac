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

PEAC core packages never mandate a specific payment rail. The commerce extension `payment_rail` field is a free string (max 128 chars). Registered rails are informational; unregistered values are accepted.

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

The `event` field values: `authorization`, `capture`, `settlement`, `refund`, `void`, `chargeback`. This field is observational metadata only: it does not encode settlement finality, protocol state transitions, or lifecycle enforcement.

## Evidence Extraction Patterns

### paymentauth

HTTP `Payment` authentication scheme, aligned with the active Internet-Draft `draft-ryan-httpauth-payment-01`. The term `paymentauth` is the code and registry identifier used in PEAC packages, schema enums, and fixture paths. MPP is an ecosystem prose term and must not appear in code identifiers, package names, fixture paths, or schema enums.

- **Approach**: envelope-first; method-specific payloads treated as `unknown`
- **Package**: `@peac/mappings-paymentauth`
- **receipt_ref**: `sha256(raw_receipt_header_value)`, not assumed JWS
- **Co-existence**: PEAC `PEAC-Receipt` and paymentauth `Payment-Receipt` can appear on the same HTTP response; no semantic coupling implied

### ACP (Agentic Commerce Protocol)

- **Approach**: lifecycle-first; session states produce access evidence; commerce evidence only from explicit payment artifacts
- **Package**: `@peac/mappings-acp`
- **Boundary**: `fromACPSessionLifecycleEvent()` for session evidence; `fromACPPaymentObservation()` for commerce evidence requiring `observed_payment_state`
- **Delegated payment** (v0.12.11): `fromACPDelegatedPaymentObservation()` maps ACP-shaped delegated-payment authorizations and settlements with an `artifact_kind` discriminator that blocks settlement synthesis from an authorization-only artifact. See [`docs/profiles/acp-delegated-payment.md`](../profiles/acp-delegated-payment.md).

### MPP / paymentauth (v0.12.11)

- **Package**: `@peac/mappings-paymentauth`
- **Functions**: `fromMPPPaymentAttempt()` for authorization evidence; `fromMPPSettlement()` for settlement evidence, with an `artifact_kind` discriminator that blocks cross-kind misuse. See [`docs/profiles/mpp-payment-evidence.md`](../profiles/mpp-payment-evidence.md).

### x402 settlement observation (v0.12.11)

- **Package**: `@peac/adapter-x402`
- **Settlement observation**: `extractSettlementProofFromHeaders()` returns proofs in dual-header precedence order; `fromX402SettlementObservation()` produces commerce settlement evidence only from a non-empty extracted proof. Scheme-specific invariants remain upstream responsibility. See [`docs/specs/X402-V2-PROFILE.md`](X402-V2-PROFILE.md) §8.

### Stripe SPT (Shared Payment Tokens)

- **Approach**: delegation-first; SPT grant/use/deactivate are delegation lifecycle events
- **Package**: `@peac/rails-stripe`
- **Boundary**: SPT functions produce delegation evidence; only `fromStripePaymentIntentObservation()` emits commerce events; `succeeded` maps to settlement; `requires_capture` maps to authorization; `processing` and `canceled` produce no commerce event

### x402

- **Approach**: verification-first; 4-layer architecture (A1/A2/B/C)
- **Package**: `@peac/adapter-x402`
- **Header read order**: PEAC-Receipt, PAYMENT-RESPONSE (v2), X-PAYMENT-RESPONSE (v1)

### UCP (Universal Commerce Protocol)

- **Approach**: order-vs-payment separation; order state distinct from payment state
- **Package**: `@peac/mappings-ucp`
- **Boundary**: `payment_state_source` marker distinguishes `explicit` from `derived_order_fallback`
- **Signing model**: the current UCP signing model is RFC 9421 HTTP Message Signatures (`Signature-Input` / `Signature`) with an RFC 9530 `Content-Digest` computed over the raw request body bytes (no JSON canonicalization), verified by `verifyUcpHttpSignature`. The algorithm is resolved from the signing key curve (ES256 for P-256, ES384 for P-384); UCP omits `alg` from `Signature-Input`. PEAC observes and binds the UCP signature facts (covered components, `Content-Digest`, `keyid`, and any signed `UCP-Agent` profile); it does not assert UCP conformance or re-sign UCP messages. The earlier `Request-Signature` detached JWS (RFC 7797) path remains available, deprecated, as `verifyUcpWebhookSignature`; the two schemes never silently fall back to each other.

## Cross-Ecosystem Evidence

PEAC can normalize evidence from multiple commerce protocols into a single audit bundle. The experimental `CommerceEvidenceBundle` in `@peac/audit` correlates receipts across payment rails without aggregating or asserting settlement totals.

## Naming Conventions

### paymentauth vs MPP

`paymentauth` is the canonical code and registry term, aligned with the active Internet-Draft `draft-ryan-httpauth-payment-01`. It appears in package names (`@peac/mappings-paymentauth`), registry entries, fixture paths, and schema values. MPP is an ecosystem prose term; it must not appear in code identifiers, package names, fixture paths, or schema enums.

### ACP

ACP refers to the Agentic Commerce Protocol (maintained by OpenAI and Stripe). It must not be confused with Agent Communication Protocol (IBM/BeeAI, now merged into A2A). On first mention in each document, expand to "Agentic Commerce Protocol (ACP)".

## Related Specifications

- [Commerce Integration Matrix](COMMERCE-INTEGRATION-MATRIX.md): summary table of all commerce rails
- [Commerce Semantics](COMMERCE-SEMANTICS.md): mapping rules and payment state vocabulary
- [Evidence Carrier Contract](EVIDENCE-CARRIER-CONTRACT.md): transport placement rules
- [Commerce Protocol Coverage](../compatibility/commerce-protocol-coverage.md): canonical x402 / paymentauth / ACP truth matrix

## Mapper-Boundary Finality-Synthesis Guard

Commerce mappings MUST enforce the no-finality-synthesis rule at the mapper boundary using the shared helper exported by `@peac/adapter-core`:

```ts
import { assertExplicitFinality, MapperBoundaryError } from '@peac/adapter-core';

assertExplicitFinality(
  {
    event, // candidate commerce event, may be undefined
    hasExplicitUpstreamArtifact, // boolean derived from upstream-supplied data
    currency, // upstream-asserted currency
    env, // 'live' | 'test' from upstream
    envExplicit, // true when env was upstream-asserted
  },
  { mode: 'interop', pointer: '/proofs/x402/offer' }
);
```

The guard MUST be invoked at every entry point that may produce a `commerce.event` value. Mappings MUST NOT fall back silently to `currency: 'UNKNOWN'`, defaulted `env`, or any synthesized finality state.

### Strictness modes

| Mode                | Finality-event without explicit artifact | Silent currency fallback | Defaulted env  |
| ------------------- | ---------------------------------------- | ------------------------ | -------------- |
| `strict`            | reject (throw)                           | reject (throw)           | reject (throw) |
| `interop` (default) | reject (throw)                           | warn                     | warn           |
| `legacy`            | reject (throw)                           | silent                   | silent         |

Rule 1 (finality event without explicit upstream artifact) rejects in **all** modes; this is non-negotiable. Rules 2 and 3 (silent fallbacks) are mode-controlled. The default `interop` mode preserves current consumer behavior on rules 2 and 3 while emitting deprecation warnings; consumers are expected to migrate to `strict` before v0.13.0.

### Error code

Violations produce `MapperBoundaryError` carrying the stable string code `commerce.finality_synthesis_blocked`. This is a **mapper-boundary identifier**, not a wire-level error code; the wire format is unchanged. Consumers may switch on this code to map the failure to caller-specific error reporting.

### Finality-bearing events

The closed set of commerce events that imply finality and therefore require an explicit upstream payment artifact:

- `authorization`
- `capture`
- `settlement`
- `refund`
- `void`
- `chargeback`

Non-finality observations (for example, discovery responses, capability snapshots, session-lifecycle access events) MUST NOT set `commerce.event` and are exempt from the guard.
