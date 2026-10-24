# Policy Hash Test Vectors

Deterministic test vectors for policy-hash canonicalization.
Last reviewed: 2026-04-01

Each vector contains an `input` object, an `expected_hash` (SHA-256, base64url),
and `notes` explaining the normalization rules exercised.

## Vectors

| File           | Coverage                                                    |
| -------------- | ----------------------------------------------------------- |
| `vector1.json` | URL scheme/host lowercasing, default port removal           |
| `vector2.json` | Dot-segment resolution, unreserved percent-encoding         |
| `vector3.json` | Reserved encoding preservation, array ordering, key sorting |

These vectors were defined for the policy-hash canonicalization of the archived
`@peac/core` package and are kept as historical reference. No current package
implements this canonicalization, and no active test consumes them. Do not
modify the `input` or `expected_hash` fields.
