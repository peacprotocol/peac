# @peac/compat

Workspace-private package contract. Not published to npm.

This package holds the migration-class taxonomy (`exact` / `derived` /
`lossy` / `impossible`) and the archival-export reader / writer /
validator. The exports are a workspace-private package contract; they
are not a public protocol surface and not a stable cross-organization
interchange format. The `peac-archival/0.1-internal` identifier is a
workspace-private record shape used by local migration and archival
tooling tests.

The package surface:

- `MigrationClass`, `MigrationVerdict`, `classifyMigration(...)` in
  `src/taxonomy.ts`.
- `ArchivalRecord`, `ArchivalBundle`, `ArchivalValidationFailure`,
  `ArchivalValidationResult`, `serializeArchivalBundle(...)`,
  `parseArchivalBundle(...)`, `validateArchivalBundle(...)` in
  `src/archival-export.ts`.

See `spec/MIGRATION-CLASSES.md` and `spec/ARCHIVAL-EXPORT.md` for the
package-local contract details.

## Invariants

- **No published package depends on this package at runtime.**
  `@peac/protocol` does NOT import from `@peac/compat`, even from its
  `_internal/` source tree. The `protocol-private-imports.test.ts`
  tooling test asserts this invariant on every PR.
- **Tests inside this package import relatively** (`../src/taxonomy.js`,
  `../src/archival-export.js`); they do NOT import via the package
  name.
- **Reader / writer / validator are pure**: no network I/O, no
  filesystem I/O, no logging of raw secrets. The serializer is
  deterministic with stable key order and emits no wall-clock or
  random field.

## Version

Tracks the workspace-wide value enforced by
`scripts/check-version-coherence.sh`.
