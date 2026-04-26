# JOSE-hardening parity corpus

Wire 0.2 JOSE rejection parity vectors. Each vector supplies a malformed JOSE protected header that the canonical hardening check MUST reject. The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing JOSE hardening path on every vector. Divergence is stop-the-line.

## Coverage (8 vectors at floor)

| Vector id                | Rejection reason                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `jh-001-embedded-jwk`    | Header carries embedded `jwk`; rejected to prevent self-asserted key trust.               |
| `jh-002-embedded-x5c`    | Header carries embedded `x5c` chain; rejected to prevent self-asserted certificate trust. |
| `jh-003-embedded-x5u`    | Header carries `x5u` (certificate URL); rejected to prevent network-resolved trust.       |
| `jh-004-embedded-jku`    | Header carries `jku` (JWK Set URL); rejected to prevent network-resolved trust.           |
| `jh-005-crit-set`        | Header carries `crit` array; rejected because no critical extensions are defined.         |
| `jh-006-b64-false`       | Header carries `b64: false` (RFC 7797 unencoded payload); rejected for Wire 0.2.          |
| `jh-007-zip-set`         | Header carries `zip` compression; rejected for Wire 0.2.                                  |
| `jh-008-unsupported-alg` | Header declares `alg: none`; rejected because Wire 0.2 mandates EdDSA.                    |

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. The `input.header` field is REQUIRED for this family. The `expected.accepted` value is always `false`; `expected.errors` lists the canonical error code(s) the validator must emit, sorted by code.

```json
{
  "family": "jose-hardening",
  "description": "...",
  "version": "...",
  "vectors": [
    {
      "id": "...",
      "description": "...",
      "input": {
        "payload": {...},
        "header": { "alg": "...", "typ": "...", "jwk": {...} }
      },
      "expected": {
        "accepted": false,
        "errors": [{ "code": "E_JOSE_EMBEDDED_KEY", "path": "/header/jwk" }]
      }
    }
  ]
}
```

Error codes are canonical identifiers from `@peac/kernel/errors.generated.ts`. The TS-side loader and the harness use the same code symbols; divergence at the level of raw exception messages is intentionally not compared per the normalized parity verdict shape.

## Floor count

This family ships 8 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
