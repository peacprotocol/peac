# Migration classes

Workspace-private migration-class taxonomy used by `@peac/compat`. Not a public protocol surface; not part of `docs/specs/`. The taxonomy describes the package-local shape of migration verdicts.

The four migration classes are defined in `packages/compat/src/taxonomy.ts`:

| Class        | Meaning                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact`      | Target representation preserves all source bits and semantics; round-trip is byte-identical.                                                                                                                  |
| `derived`    | Target preserves all source semantics; bit-level representation differs (e.g., reordered JCS-canonicalized fields). Round-trip from target back to source is not byte-identical but is semantically lossless. |
| `lossy`      | Target preserves all required semantics for the target's profile; source-specific fields without a target equivalent are dropped or summarized. Round-trip is impossible.                                     |
| `impossible` | Source cannot be represented in the target without loss of required semantics. Migration MUST refuse.                                                                                                         |

The current `classifyMigration` helper covers three concrete cases: identity, frozen legacy boundary, default-unclassified. Cross-version, cross-codec, and cross-profile verdicts beyond these three are not part of this package contract.

## Frozen legacy boundary

For the `peac.receipt/0.9 -> peac-receipt/0.1` pair, `classifyMigration` returns `impossible`. The verdict's note string uses neutral machine-identifier-anchored prose (`"Frozen legacy boundary: source and target identifiers are verify-only; no automatic migration is defined."`). Marketing prose ("Wire 0.9 -> Wire 0.1+") is forbidden in the note string; machine identifiers anchor the conditional, not English prose.

## Boundaries

- Workspace-private taxonomy. Not published; absent from `scripts/publish-manifest.json`.
- Not a public protocol surface. The taxonomy and helper are exposed only to other workspace packages and tests.
- No published package depends on this package at runtime.
