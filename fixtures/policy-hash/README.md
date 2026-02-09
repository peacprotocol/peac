# Policy Hash Test Vectors

Deterministic test vectors for policy-hash canonicalization.

Each vector contains an `input` object, an `expected_hash` (SHA-256, base64url),
and `notes` explaining the normalization rules exercised.

## Vectors

| File           | Coverage                                                    |
| -------------- | ----------------------------------------------------------- |
| `vector1.json` | URL scheme/host lowercasing, default port removal           |
| `vector2.json` | Dot-segment resolution, unreserved percent-encoding         |
| `vector3.json` | Reserved encoding preservation, array ordering, key sorting |

These files are consumed by the policy-kit conformance tests. Do not modify
the `input` or `expected_hash` fields -- they are normative fixtures.
