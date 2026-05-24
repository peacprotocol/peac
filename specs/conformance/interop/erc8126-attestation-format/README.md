# ERC-8126 attestation-format interop vectors

This directory contains repository interop fixtures that use an illustrative fixture carrier label (`attestationFormat`) for PEAC-side references to ERC-8126 / ERC-8004 Validation Registry attestation surfaces.

The fixtures are not normative ERC-8126 conformance vectors and do not stand in for a registry-shipped attestation format. They exist so PEAC-side tooling can exercise deterministic handling of attestation references that include carrier metadata.

## Layout

```text
erc8126-attestation-format/
  README.md
  positive/
    v01-jws-attestation.json
    v02-eip712-attestation.json
    v03-onchain-attestation.json
  negative/
    v04-unknown-format.json
    v05-missing-format.json
```

Positive vectors (3) declare an `attestationFormat` value drawn from the illustrative fixture label set and pair it with an opaque `attestation_ref` that points to a carrier-specific payload (not embedded in the fixture). Each positive vector also declares its expected canonical-bytes SHA-256 digest under `expected.canonical_bytes_sha256_hex`, computed as `sha256_hex(JCS_RFC8785(input))`. This makes byte-deterministic verification possible without invoking any external service.

Negative vectors (2) exercise unsupported and missing carrier metadata. Each negative vector declares `expected_failure.kind` and `expected_failure.reason` as fixture-scoped descriptive strings. These strings are not stable PEAC error codes, not a normative error class, and not part of any public PEAC API. They exist solely to make the repository interop verifier deterministic.

## Carrier-label set covered

- `jws` (positive)
- `eip712` (positive)
- `onchain` (positive)
- unsupported carrier label (negative)
- absent label (negative)

The companion composition note at `docs/specs/ERC-8126-COMPOSITION.md` mentions COSE-Sign1 as an adjacent carrier class. This fixture set intentionally does not include a COSE-Sign1 vector. This repository does not include a PEAC COSE carrier implementation.

## Field shape

All positive and negative inputs share a baseline attestation-reference shape:

| Field               | Type    | Notes                                                                                                                                                           |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_id`          | string  | Opaque ERC-8004 agent identifier; not validated by these fixtures.                                                                                              |
| `verification_type` | string  | Acronym drawn from ERC-8126 verification terminology. These fixtures use representative ERC-8126 terms; the ERC-8126 specification remains the source of truth. |
| `risk_score`        | integer | Integer 0-100; informational only for these fixtures.                                                                                                           |
| `attestationFormat` | string  | Fixture carrier label used by this fixture set (or absent on `v05-missing-format`).                                                                             |
| `attestation_ref`   | string  | Opaque reference to the carrier-specific payload. The carrier payload itself is not embedded in the fixture.                                                    |
| `observed_at`       | string  | RFC 3339 UTC timestamp.                                                                                                                                         |

## Verification

The repository verifier at `scripts/verify-interop-vectors.mjs` walks this directory and asserts:

- Each fixture matches the required envelope described by `specs/conformance/schemas/interop-vector.json`.
- Each positive fixture's input, when JCS-canonicalized and SHA-256 digested, yields lowercase hex bytes matching `expected.canonical_bytes_sha256_hex`.
- Each negative fixture exercises its declared `expected_failure.reason` against the family's fixture-scoped validation rule (`attestationFormat` value must be present and drawn from the recognized fixture label set defined in this README).
- Exactly 3 positive vectors and 2 negative vectors are present in this directory.

## Boundary

These fixtures do not standardize ERC-8126. PEAC records references to ERC-8126-aligned attestation artifacts. The `attestationFormat` field is repository fixture metadata; it is not required by PEAC and is not defined by PEAC. ERC-8126 and ERC-8004 define their own registry semantics.
