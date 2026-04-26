# JOSE-hardening parity corpus

Wire 0.2 JOSE rejection parity vectors. Each vector supplies a malformed JOSE protected header that the canonical hardening check MUST reject. The bounded shadow-mode validator foundation introduced in v0.13.1 must reach **zero divergence** with the existing JOSE hardening path on every vector. Divergence is stop-the-line.

## Coverage (8 vectors at floor)

| Vector id             | Canonical error code (`@peac/crypto`) | Rejection reason                                                                          |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `jh-001-embedded-jwk` | `CRYPTO_JWS_EMBEDDED_KEY`             | Header carries embedded `jwk`; rejected to prevent self-asserted key trust.               |
| `jh-002-embedded-x5c` | `CRYPTO_JWS_EMBEDDED_KEY`             | Header carries embedded `x5c` chain; rejected to prevent self-asserted certificate trust. |
| `jh-003-embedded-x5u` | `CRYPTO_JWS_EMBEDDED_KEY`             | Header carries `x5u` (certificate URL); rejected to prevent network-resolved trust.       |
| `jh-004-embedded-jku` | `CRYPTO_JWS_EMBEDDED_KEY`             | Header carries `jku` (JWK Set URL); rejected to prevent network-resolved trust.           |
| `jh-005-crit-set`     | `CRYPTO_JWS_CRIT_REJECTED`            | Header carries `crit` array; rejected because no critical extensions are defined.         |
| `jh-006-b64-false`    | `CRYPTO_JWS_B64_REJECTED`             | Header carries `b64: false` (RFC 7797 unencoded payload); rejected for Wire 0.2.          |
| `jh-007-zip-set`      | `CRYPTO_JWS_ZIP_REJECTED`             | Header carries `zip` compression; rejected for Wire 0.2.                                  |
| `jh-008-missing-kid`  | `CRYPTO_JWS_MISSING_KID`              | Header omits `kid`; rejected because `validateWire02Header` requires non-empty kid.       |

The canonical hardening function `validateWire02Header` in `packages/crypto/src/jws.ts` checks: missing/empty/oversized `kid`, embedded key material (`jwk`/`x5c`/`x5u`/`jku`), `crit`, `b64:false`, and `zip`. Algorithm validation lives in a separate function (`buildHeader`) and is not part of the JOSE-hardening parity scope.

## Format

Validated against `vectors.schema.json` (JSON Schema 2020-12) at corpus-loader time. The `input.header` field is REQUIRED for this family. The `expected.accepted` value is always `false`; `expected.errors[]` lists the canonical `CryptoError.code` value(s) the canonical path emits, sorted by code.

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
        "payload": { "...": "..." },
        "header": { "alg": "...", "typ": "...", "jwk": { "...": "..." } }
      },
      "expected": {
        "accepted": false,
        "errors": [{ "code": "CRYPTO_JWS_EMBEDDED_KEY" }]
      }
    }
  ]
}
```

Error codes are the actual `CryptoError.code` values thrown by `@peac/crypto.validateWire02Header`. The hardening function does not attach a structured `path`; comparison is on `code` only. Divergence at the level of raw exception messages is intentionally not compared per the normalized parity verdict shape.

## Floor count

This family ships 8 vectors as the v0.13.1 floor. Expansion is permitted only when differential parity reveals a coverage gap; each expansion is a separate commit.
