# Default-flows parity corpus

Wire 0.2 happy-path parity vectors. Every vector is accepted by the canonical validator chain (kernel constraints, type-extension mapping, JOSE hardening when header is present, temporal, issuer-form, extension-budget).

The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing canonical path on every vector in this family. Divergence is stop-the-line.

## Coverage (12 vectors at floor)

| Vector id                                   | What it covers                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `df-001-evidence-payment`                   | Minimal valid evidence record with registered payment type and commerce extension. |
| `df-002-evidence-attribution`               | Evidence record with attribution-event type and matching extension group.          |
| `df-003-evidence-consent-record`            | Evidence record with consent-record type and matching extension group.             |
| `df-004-evidence-purpose-declaration`       | Evidence record with purpose-declaration type and matching extension group.        |
| `df-005-evidence-safety-review`             | Evidence record with safety-review type and matching extension group.              |
| `df-006-evidence-identity-attestation`      | Evidence record with identity-attestation type and matching extension group.       |
| `df-007-agreement-payment`                  | Minimal valid agreement-kind record with registered payment type.                  |
| `df-008-evidence-with-pillars`              | Evidence record with single pillar value.                                          |
| `df-009-evidence-multi-extension`           | Evidence record with two registered extension groups.                              |
| `df-010-evidence-with-occurred-at`          | Evidence record with explicit `occurred_at` distinct from `iat`.                   |
| `df-011-evidence-unregistered-type-allowed` | Evidence record with non-registered reverse-DNS type; mapping does not gate.       |
| `df-012-agreement-multi-pillar`             | Agreement record with multiple distinct pillar values.                             |

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
