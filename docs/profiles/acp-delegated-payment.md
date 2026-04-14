# ACP Delegated Payment Profile

**Status:** Draft
**Since:** v0.12.11
**Extension Namespace:** `org.peacprotocol/commerce`
**Package:** `@peac/mappings-acp`
**Spec:** [COMMERCE-EVIDENCE.md](../specs/COMMERCE-EVIDENCE.md)
**Coverage:** [commerce-protocol-coverage.md](../compatibility/commerce-protocol-coverage.md)

## Abstract

Records observations of ACP-shaped delegated-payment authorizations and
settlements as signed PEAC Interaction Records. Observational only: PEAC
records what the upstream ACP-aware payment surface attested; PEAC does
not enforce ACP lifecycle, checkout policy, or token verification.

## Use case

An ACP-aware merchant or payment processor that issues delegated-payment
authorizations to agents (with explicit principal, delegate, and opaque
payment-method-token reference) wants portable, signed records of
authorization and settlement events that a third party can verify
without accessing the merchant's backing systems.

## Package / Function

```typescript
import { fromACPDelegatedPaymentObservation } from '@peac/mappings-acp';
```

## Mapping

| Input (upstream delegated-payment artifact) | PEAC Record Field                                                                                                   | Semantics                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `delegation_id`                             | `payment.evidence.acp_delegation_id`                                                                                | Preserved as string                                                 |
| `principal`                                 | `payment.evidence.acp_principal`                                                                                    | Preserved as string                                                 |
| `delegate`                                  | `payment.evidence.acp_delegate`                                                                                     | Preserved as string                                                 |
| `payment_method_token_ref`                  | `payment.evidence.acp_payment_method_token_ref`                                                                     | Opaque reference; NEVER token material                              |
| `authorized_amount_minor`                   | `payment.amount` (integer minor units), canonical string preserved under `payment.evidence.authorized_amount_minor` | Base-10 integer string per RFC 8785; smallest currency unit         |
| `artifact_kind`                             | `payment.evidence.proofs.acp.delegated_payment.artifact_kind`                                                       | Required for finality states; MUST match `observed_payment_state`   |
| `currency`                                  | `payment.currency`                                                                                                  | Required in strict mode; rejected if UNKNOWN/empty                  |
| `env`                                       | `payment.env`                                                                                                       | Closed enum `live` \| `test`; required in strict mode               |
| `observed_payment_state`                    | `payment.evidence.observed_payment_state`                                                                           | Closed enum at mapper boundary                                      |
| `upstream_artifact`                         | `payment.evidence.proofs.acp.delegated_payment.upstream_artifact`                                                   | Preserved verbatim; opaque to PEAC                                  |
| (derived) `commerce_event`                  | `payment.evidence.commerce_event`                                                                                   | Set ONLY for `authorized` -> authorization, `settled` -> settlement |

## Schema vs profile fields

| Field                | Defined in schema?            | Profile-specific? |
| -------------------- | ----------------------------- | ----------------- |
| `payment.rail`       | Yes (PaymentEvidence)         | No                |
| `payment.amount`     | Yes (PaymentEvidence)         | No                |
| `payment.currency`   | Yes (PaymentEvidence)         | No                |
| `payment.env`        | Yes (PaymentEvidence)         | No                |
| `payment.evidence.*` | Free-form `JsonObject`        | Profile-specific  |
| `commerce.event`     | Yes (CommerceExtensionSchema) | Constrained here  |

The profile constrains how `commerce.event` is populated; it does not add
new wire fields.

## Closed observed-payment-state enum

The mapper boundary accepts the following observed states:

- `authorized` -> emits `commerce.event = 'authorization'`
- `settled` -> emits `commerce.event = 'settlement'`
- `pending` -> NO commerce event
- `failed` -> NO commerce event
- `revoked` -> NO commerce event

Terminal-but-non-finality states (`pending`, `failed`, `revoked`) produce
evidence with no commerce event so that downstream consumers cannot
infer settlement from a failed or revoked observation.

## Strictness modes

The mapper threads through the shared finality-synthesis guard exported
by `@peac/adapter-core`:

- `strict` rejects missing or `UNKNOWN` currency, and any `env` outside
  the closed `live` | `test` enum.
- `interop` (default) emits a deprecation warning instead of rejecting
  on those conditions.
- `legacy` is silent.

In all modes, the guard rejects synthesis of finality without an
explicit upstream artifact. Because the function contract requires
`upstream_artifact` to be provided, this rule fails only on misuse.

```typescript
import { fromACPDelegatedPaymentObservation } from '@peac/mappings-acp';

const out = fromACPDelegatedPaymentObservation(
  {
    delegation_id: 'del_test_001',
    resource_uri: 'https://merchant.example.com/checkout/abc',
    principal: 'user_123',
    delegate: 'agent_xyz',
    payment_method_token_ref: 'pmt_ref_opaque',
    authorized_amount_minor: '2599',
    currency: 'USD',
    env: 'live',
    observed_payment_state: 'authorized',
    upstream_artifact: {
      source: 'acp.delegated_payment.v1',
      raw: {
        /* ... */
      },
    },
  },
  { mode: 'strict' }
);
```

## Settlement-proof discriminator

The `artifact_kind` field self-describes the upstream artifact and prevents
a generic or authorization-only artifact from being treated as a settlement
proof. The mapper rejects mismatches in all strictness modes (it is a
finality-rule violation, not a fallback warning):

- `observed_payment_state: 'authorized'` requires `artifact_kind: 'authorization'`.
- `observed_payment_state: 'settled'` requires `artifact_kind: 'settlement'`.
- Non-finality states (`pending`, `failed`, `revoked`) ignore `artifact_kind`.

A mismatch produces a `MapperBoundaryError` with code
`commerce.finality_synthesis_blocked` and pointer
`/proofs/acp/delegated_payment`.

## Amount semantics

`payment.amount` is the integer minor-unit value (smallest currency unit)
parsed from `authorized_amount_minor`. PEAC does NOT apply currency-aware
scaling. The canonical base-10 integer string remains under
`payment.evidence.authorized_amount_minor` for downstream consumers that
need the original representation. Conversion to major units is the
consumer's responsibility.

## Non-goals

- PEAC does NOT enforce ACP lifecycle invariants (state transitions,
  expiry, retries).
- PEAC does NOT verify payment-method tokens cryptographically.
- PEAC does NOT bind facilitators or reason about settlement guarantees.
- PEAC does NOT synthesize settlement from a session-completion or any
  other lifecycle state alone.
- PEAC does NOT carry token material; only an opaque reference is
  preserved.

## Stability

ACP `API-Version: 2026-01-30` is treated as Beta per the
[commerce protocol coverage matrix](../compatibility/commerce-protocol-coverage.md).
The mapping surface is additive in v0.12.11; behavior changes will go
through the standard normative-decision process.

## See also

- [Commerce Evidence Specification](../specs/COMMERCE-EVIDENCE.md)
- [Commerce Protocol Coverage](../compatibility/commerce-protocol-coverage.md)
- [Commerce Profile](commerce.md)
