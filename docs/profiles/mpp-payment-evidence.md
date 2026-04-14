# MPP Payment Evidence Profile

**Status:** Draft
**Since:** v0.12.11
**Extension Namespace:** `org.peacprotocol/commerce`
**Package:** `@peac/mappings-paymentauth`
**Spec:** [COMMERCE-EVIDENCE.md](../specs/COMMERCE-EVIDENCE.md)
**Coverage:** [commerce-protocol-coverage.md](../compatibility/commerce-protocol-coverage.md)

## Abstract

Records observations of MPP / paymentauth payment-attempt and settlement
artifacts as signed PEAC Interaction Records. Observational only: PEAC
records what an upstream paymentauth-aware payment surface attested.
PEAC does not verify payment tokens cryptographically, bind facilitators,
or reason about refund or chargeback semantics.

`paymentauth` is the canonical code and registry term aligned with the
active draft `draft-ryan-httpauth-payment-01`. MPP is an ecosystem prose
term; it is not used in package names, registry entries, fixture paths,
or schema enums.

## Use case

A merchant or facilitator that issues paymentauth payment attempts and
settlement attestations wants portable, signed records of authorization
and settlement events that a third party can verify without accessing
the merchant's backing systems.

## Package / Functions

```typescript
import { fromMPPPaymentAttempt, fromMPPSettlement } from '@peac/mappings-paymentauth';
```

## Mapping

| Function                | Output `commerce.event` | Required `artifact_kind` |
| ----------------------- | ----------------------- | ------------------------ |
| `fromMPPPaymentAttempt` | `authorization`         | `'authorization'`        |
| `fromMPPSettlement`     | `settlement`            | `'settlement'`           |

| Input field                    | PEAC Record Field                                                        | Semantics                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `attempt_id` / `settlement_id` | `payment.reference`, `payment.evidence.paymentauth_*_id`                 | Preserved as string                                                        |
| `payment_token_ref`            | `payment.evidence.payment_token_ref`                                     | Opaque reference; NEVER token material                                     |
| `amount_minor`                 | `payment.amount` (integer minor units)                                   | Base-10 integer string per RFC 8785; smallest currency unit                |
| `currency`                     | `payment.currency`                                                       | Required in strict mode; rejected if UNKNOWN/empty                         |
| `env`                          | `payment.env`                                                            | Closed enum `live` \| `test`; required in strict mode                      |
| `artifact_kind`                | `payment.evidence.proofs.paymentauth.{attempt,settlement}.artifact_kind` | Required; mismatch with the function rejected in ALL modes                 |
| `facilitator_attestation`      | `payment.evidence.proofs.paymentauth.*.facilitator_attestation`          | Optional; preserved verbatim when present; PEAC does NOT bind facilitators |
| `upstream_artifact`            | `payment.evidence.proofs.paymentauth.*.upstream_artifact`                | Preserved verbatim; opaque to PEAC                                         |
| `challenge_id`                 | `payment.evidence.challenge_id`                                          | Optional correlation reference for the originating 402 challenge           |
| `attempt_id` (settlement)      | `payment.evidence.paymentauth_attempt_id`                                | Optional correlation reference for the originating attempt                 |

## Settlement-proof discriminator

The `artifact_kind` field self-describes the upstream artifact and
prevents an authorization-bearing artifact from being treated as a
settlement proof. The mapper rejects mismatches in all strictness modes:

- `fromMPPPaymentAttempt` requires `artifact_kind: 'authorization'`.
- `fromMPPSettlement` requires `artifact_kind: 'settlement'`.

A mismatch produces a `MapperBoundaryError` with code
`commerce.finality_synthesis_blocked` and pointer
`/proofs/paymentauth/attempt` or `/proofs/paymentauth/settlement`.

## Amount semantics

`payment.amount` is the integer minor-unit value (smallest currency unit)
parsed from `amount_minor`. PEAC does NOT apply currency-aware scaling.
USD `'1000'` and JPY `'1000'` both produce `payment.amount = 1000`.
Conversion to major units is the consumer's responsibility.

## Strictness modes

- `strict` rejects missing or `UNKNOWN` currency, env outside the closed
  `live` | `test` enum, and silent fallbacks.
- `interop` (default) emits a deprecation warning instead of rejecting
  on those conditions.
- `legacy` is silent.

Rule 1 (artifact_kind mismatch and missing upstream_artifact) rejects in
all modes.

## Non-goals

- PEAC does NOT verify payment tokens cryptographically.
- PEAC does NOT bind facilitators or treat facilitator-signed statements
  as proof beyond what the upstream artifact attests.
- PEAC does NOT reason about refund or chargeback semantics; those would
  appear as additional observations with their own commerce events.
- PEAC does NOT carry token material; only `payment_token_ref` (an opaque
  reference) is preserved.

## Stability

`draft-ryan-httpauth-payment-01` is treated as Experimental per the
[commerce protocol coverage matrix](../compatibility/commerce-protocol-coverage.md).
The mapping surface is additive in v0.12.11.

## See also

- [Commerce Evidence Specification](../specs/COMMERCE-EVIDENCE.md)
- [Commerce Protocol Coverage](../compatibility/commerce-protocol-coverage.md)
- [ACP Delegated Payment Profile](acp-delegated-payment.md)
- [x402 Scheme Coverage](../compatibility/x402-scheme-coverage.md)
