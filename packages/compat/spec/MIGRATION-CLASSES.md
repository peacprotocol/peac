# Migration classes (internal scaffold)

Internal scaffold for v0.13.1. v0.13.2+ finalizes this into a normative
document under `docs/specs/`.

The four migration classes are defined in `packages/compat/src/taxonomy.ts`:

| Class        | Meaning                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact`      | Target representation preserves all source bits and semantics; round-trip is byte-identical.                                                                                                                  |
| `derived`    | Target preserves all source semantics; bit-level representation differs (e.g., reordered JCS-canonicalized fields). Round-trip from target back to source is not byte-identical but is semantically lossless. |
| `lossy`      | Target preserves all required semantics for the target's profile; source-specific fields without a target equivalent are dropped or summarized. Round-trip is impossible.                                     |
| `impossible` | Source cannot be represented in the target without loss of required semantics. Migration MUST refuse.                                                                                                         |

v0.13.1 sets the type surface and the `classifyMigration` helper for three
concrete cases (identity, frozen legacy boundary, default-unclassified).
Future releases fill in cross-version, cross-codec, and cross-profile
verdicts as they are designed.

## Frozen legacy boundary

For the `peac.receipt/0.9 -> peac-receipt/0.1` pair, `classifyMigration`
returns `impossible`. The verdict's note string uses neutral
machine-identifier-anchored prose ("Frozen legacy boundary: source and
target identifiers are verify-only; no automatic migration is defined.").
Marketing prose ("Wire 0.9 -> Wire 0.1+") is forbidden in the note string;
machine identifiers anchor the conditional, not English prose.
