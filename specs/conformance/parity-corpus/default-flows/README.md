# Default-flows parity corpus

Wire 0.2 happy-path parity vectors. Every vector is accepted by the canonical validator chain (kernel constraints, type-extension mapping, JOSE hardening when header is present, temporal, issuer-form, extension-budget).

The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing canonical path on every vector in this family. Divergence is stop-the-line.

## Coverage (12 vectors at floor)

| Vector id                                   | What it covers                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `df-001-evidence-payment`                   | Evidence with registered `payment` type and canonical commerce extension (`payment_rail`/`amount_minor`/`currency`).    |
| `df-002-evidence-attribution`               | Evidence with `attribution-event` type and canonical attribution extension (`creator_ref`).                             |
| `df-003-evidence-consent-record`            | Evidence with `consent-record` type and canonical consent extension (`consent_basis`/`consent_status`).                 |
| `df-004-evidence-purpose-declaration`       | Evidence with `purpose-declaration` type and canonical purpose extension (`external_purposes`).                         |
| `df-005-evidence-safety-review`             | Evidence with `safety-review` type and canonical safety extension (`review_status`).                                    |
| `df-006-evidence-identity-attestation`      | Evidence with `identity-attestation` type and canonical identity extension (`proof_ref`).                               |
| `df-007-challenge-payment`                  | Minimal valid challenge-kind record with registered payment type. (Wire 0.2 has only `evidence` and `challenge` kinds.) |
| `df-008-evidence-with-pillars`              | Evidence with single pillar value (`["commerce"]`).                                                                     |
| `df-009-evidence-multi-extension`           | Evidence with two registered extension groups (commerce + purpose).                                                     |
| `df-010-evidence-with-occurred-at`          | Evidence with explicit `occurred_at` (RFC 3339 with offset) earlier than `iat`.                                         |
| `df-011-evidence-unregistered-type-allowed` | Evidence with non-registered reverse-DNS type; type-extension mapping does not gate.                                    |
| `df-012-evidence-multi-pillar`              | Evidence with multiple distinct pillar values (sorted ascending).                                                       |

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. See `parity-corpus/default-flows/vectors.schema.json`.

```json
{
  "family": "default-flows",
  "description": "...",
  "version": "...",
  "generator": "...",
  "vectors": [
    {
      "id": "...",
      "description": "...",
      "input": { "payload": {...} },
      "expected": { "accepted": true }
    }
  ]
}
```

`input.payload` is a parsed Wire 0.2 claims object. The validator chain consumes claims directly; no JWS signing is performed at fixture creation time. Deterministic `iat` and `jti` values keep canonical claims digests stable.

## Floor count

This family ships 12 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
