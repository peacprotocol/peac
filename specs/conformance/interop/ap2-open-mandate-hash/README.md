# AP2 `open_mandate_hash` interop vectors

This directory holds repository interop fixtures that exercise the `open_mandate_hash` derivation discussed on `google-agentic-commerce/AP2#265`. The derivation referenced by that issue is:

```text
open_mandate_hash = sha256_hex(JCS_RFC8785(unsigned open-checkout-mandate body))
```

(lowercase hexadecimal; the hash input is the claims object, not the JWS compact form). These fixtures complement the cross-implementation work already present in that thread; they do not extend AP2 or replace the AP2 mandate mechanism.

## Layout

```text
ap2-open-mandate-hash/
  README.md
  positive/
    v01-open-mandate-hash-baseline.json
    v02-open-mandate-hash-with-budget.json
    v03-open-mandate-hash-with-expiry.json
  negative/
    v04-non-sha256-digest.json
    v05-non-jcs-canonicalization.json
```

Positive vectors (3) declare a synthetic but plausible unsigned open-checkout-mandate body and pair it with the expected `open_mandate_hash` value, computed as `sha256_hex(JCS_RFC8785(input))`. These bodies are intentionally minimal and do not claim to be normative AP2 mandate shapes; they exist so the repository interop verifier can verify byte-deterministic regeneration of the digest under the derivation rule.

Negative vectors (2) exercise the two most common composition failure modes: using a non-SHA-256 digest function on the canonical bytes, and using a non-JCS canonicalization rule for the input bytes. Each negative vector declares `expected_failure.kind` and `expected_failure.reason` as fixture-scoped descriptive strings. These strings are not stable PEAC error codes, not a normative error class, and not part of any public PEAC API.

## Mandate-body shape used by the fixtures

All positive fixtures share a baseline shape:

| Field             | Type    | Notes                                                              |
| ----------------- | ------- | ------------------------------------------------------------------ |
| `mandate_type`    | string  | Always `open_checkout_mandate` for these fixtures.                 |
| `mandate_version` | string  | Synthetic version label (`0.1.0`) used for fixture identification. |
| `principal`       | string  | Opaque principal identifier (DID-shaped string).                   |
| `agent`           | string  | Opaque agent identifier (DID-shaped string).                       |
| `currency`        | string  | ISO 4217 alphabetic code.                                          |
| `amount_minor`    | integer | Authorized base amount in minor units.                             |
| `items`           | array   | Mandate line items (empty for these baseline fixtures).            |
| `issued_at`       | string  | RFC 3339 UTC timestamp.                                            |
| `budget`          | object  | Present only on `v02-open-mandate-hash-with-budget`.               |
| `expires_at`      | string  | Present only on `v03-open-mandate-hash-with-expiry`.               |

The vectors deliberately do not target the canonicalization edge cases already covered by the cross-implementation work in `AP2#265` (object-key-order, array-order, optional fields, currency-minor-unit, Unicode NFC vs NFD). PEAC-side coverage is scenario-shaped: baseline, budget-bound, expiry-bound, plus the two negative composition-failure cases.

## Verification

The repository verifier at `scripts/verify-interop-vectors.mjs` walks this directory and asserts:

- Each fixture matches the required envelope described by `specs/conformance/schemas/interop-vector.json`.
- Each positive fixture's input, when JCS-canonicalized and SHA-256 digested, yields lowercase hex bytes matching `expected.open_mandate_hash`.
- Each positive fixture's canonical bytes regenerate byte-for-byte across runs.
- Each negative fixture exercises its declared failure mode (non-SHA-256 digest function on the canonical bytes, or non-JCS canonicalization on the input bytes).
- Exactly 3 positive vectors and 2 negative vectors are present in this directory.

## Boundary

These fixtures do not extend AP2 or replace the AP2 mandate mechanism. PEAC can record signed interaction records that reference AP2 mandate artifacts; it does not introduce a parallel authorization model. AP2 normative authority for the mandate mechanism lives outside this repository.
