# Runtime-governance parity corpus

Managed-runtime wedge parity vectors. Covers the 6 observation-specific type URIs from `@peac/adapter-runtime-governance` plus one negative vector. The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing canonical path on every vector. Divergence is stop-the-line.

## Coverage (7 vectors at floor)

| Vector id                          | Type URI suffix                                                     |
| ---------------------------------- | ------------------------------------------------------------------- |
| `rg-001-policy-decision`           | `policy-decision`                                                   |
| `rg-002-audit-entry`               | `audit-entry`                                                       |
| `rg-003-authority-scope`           | `authority-scope`                                                   |
| `rg-004-lifecycle-event`           | `lifecycle-event`                                                   |
| `rg-005-trust-observation`         | `trust-observation`                                                 |
| `rg-006-compliance-observation`    | `compliance-observation`                                            |
| `rg-007-negative-missing-provider` | `policy-decision` shape with extension missing the `provider` field |

The negative vector exercises a shape that the kernel validator layer accepts (the per-family field validation lives in `@peac/adapter-runtime-governance`, not in the kernel chain). The vector exists to assert that LEFT and RIGHT validators reach the same verdict for this shape, whichever verdict the canonical kernel path emits.

## Type URI reference

All 6 observation type URIs come from `packages/adapters/runtime-governance/src/constants.ts`:

```text
org.peacprotocol/runtime-governance-policy-decision
org.peacprotocol/runtime-governance-audit-entry
org.peacprotocol/runtime-governance-authority-scope
org.peacprotocol/runtime-governance-lifecycle-event
org.peacprotocol/runtime-governance-trust-observation
org.peacprotocol/runtime-governance-compliance-observation
```

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. The vectors carry runtime-governance metadata in the `org.peacprotocol/runtime-governance` extension namespace.

## Floor count

This family ships 7 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
