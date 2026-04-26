# @peac/compat

Workspace-private internal scaffold. Not published to npm.

This package holds the migration-class taxonomy (`exact` / `derived` /
`lossy` / `impossible`) and the archival-export type surface for future
cross-version / cross-codec record translation work.

v0.13.1 is the scaffold release: only the type surface and the
`classifyMigration` helper are defined. Future releases finalize the
normative documents under `docs/specs/` and add reader/writer
implementations.

## Invariants

- **No published package depends on this package at runtime.**
  `@peac/protocol` does NOT import from `@peac/compat`, even from its
  `_internal/` source tree. The `protocol-private-imports.test.ts`
  tooling test asserts this invariant on every PR.
- **Tests inside this package import relatively** (`../src/taxonomy.js`,
  `../src/archival-export.js`); they do NOT import via the package name.

## Version

Tracks the workspace-wide value enforced by `scripts/check-version-coherence.sh`.
The workspace-wide bump to v0.13.1 happens in the v0.13.1 release-prep PR.
